'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, api, dt, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

const TYPE_LABEL: Record<string, string> = { TICKET: '티켓', RESERVATION: '예약형', PASS: 'PASS' };
const VERIF_LABEL: Record<string, string> = { QR_ONLY: 'QR만', QR_PIN: 'QR+직원확인', STAFF_CONFIRM: '직원확인' };
const RESV_LABEL: Record<string, string> = { REQUESTED: '요청', CONFIRMED: '확정', CANCELLED: '취소', NO_SHOW: '노쇼', COMPLETED: '완료' };

const img = (u?: string | null, w = 160) => (u ? (u.startsWith('/') ? `${API_BASE}${u}?w=${w}` : u) : null);

function Thumb({ src }: { src?: string | null }) {
  const s = img(src);
  return s ? (
    <img src={s} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded object-cover" />
  ) : (
    <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-ground text-[10px] text-ink-3">사진없음</div>
  );
}

/** 파일 → data URL (상품 사진 업로드용) */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function ProductsPage() {
  const [tab, setTab] = useState<'products' | 'reservations'>('products');
  const [rows, setRows] = useState<any[] | null>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ merchantId: '', name: '', type: 'RESERVATION', basePrice: '', memberPrice: '', verification: 'QR_ONLY' });
  const [image, setImage] = useState<string | null>(null); // data URL
  const fileRef = useRef<HTMLInputElement>(null);

  // 예약 탭
  const [reservations, setReservations] = useState<any[] | null>(null);
  const [resvFilter, setResvFilter] = useState('');

  // 회차 모달
  const [slotFor, setSlotFor] = useState<any | null>(null);
  const [slots, setSlots] = useState<any[] | null>(null);
  const [slotForm, setSlotForm] = useState({ date: '', time: '10:00', durationMinutes: '120', capacity: '10' });
  const [slotEdit, setSlotEdit] = useState<any | null>(null);

  const load = useCallback(() => {
    api<any[]>('/admin/products').then(setRows).catch(() => setRows([]));
    api<any[]>('/admin/merchants?status=ACTIVE').then(setMerchants).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const loadReservations = useCallback((productId = resvFilter) => {
    setReservations(null);
    api<any[]>(`/admin/reservations${productId ? `?productId=${productId}` : ''}`)
      .then(setReservations)
      .catch(() => setReservations([]));
  }, [resvFilter]);
  useEffect(() => {
    if (tab === 'reservations') loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, resvFilter]);

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { alert('이미지는 5MB 이하여야 합니다'); return; }
    setImage(await fileToDataUrl(f));
  }

  async function createProduct() {
    try {
      await api('/admin/products', {
        method: 'POST',
        body: {
          merchantId: form.merchantId,
          name: form.name,
          type: form.type,
          basePrice: Number(form.basePrice),
          memberPrice: form.memberPrice ? Number(form.memberPrice) : undefined,
          verification: form.verification,
          imageBase64: image ?? undefined,
        },
      });
      setMsg('상품 등록 완료');
      setShowCreate(false);
      setForm({ merchantId: '', name: '', type: 'RESERVATION', basePrice: '', memberPrice: '', verification: 'QR_ONLY' });
      setImage(null);
      load();
    } catch (e: any) {
      setMsg(`실패: ${e.message}`);
    }
  }

  async function toggleActive(p: any) {
    await api(`/admin/products/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
    setMsg(`${p.name} → ${p.isActive ? '판매 중지' : '판매 재개'}`);
    load();
  }

  async function approveProduct(p: any) {
    await api(`/admin/products/${p.id}/approve`, { method: 'POST' });
    setMsg(`'${p.name}' 승인 — 판매가 시작됩니다`);
    load();
  }
  async function rejectProduct(p: any) {
    const reason = prompt('반려 사유를 입력하세요 (점주에게 표시됩니다)');
    if (!reason) return;
    await api(`/admin/products/${p.id}/reject`, { method: 'POST', body: { reason } });
    setMsg('반려 처리했습니다');
    load();
  }

  async function changeImage(p: any, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { alert('이미지는 5MB 이하여야 합니다'); return; }
    await api(`/admin/products/${p.id}`, { method: 'PATCH', body: { imageBase64: await fileToDataUrl(f) } });
    setMsg(`${p.name} 사진 변경 완료`);
    load();
  }

  async function openSlots(p: any) {
    setSlotFor(p);
    setSlots(null);
    setSlots(await api<any[]>(`/admin/products/${p.id}/slots`));
    const d = new Date(Date.now() + 86400_000);
    setSlotForm((f) => ({ ...f, date: d.toISOString().slice(0, 10) }));
  }

  async function addSlot() {
    if (!slotFor) return;
    try {
      const startAt = new Date(`${slotForm.date}T${slotForm.time}:00`);
      await api(`/admin/products/${slotFor.id}/slots`, {
        method: 'POST',
        body: {
          startAt: startAt.toISOString(),
          durationMinutes: Number(slotForm.durationMinutes),
          capacity: Number(slotForm.capacity),
        },
      });
      setMsg('회차 추가 완료');
      setSlots(await api<any[]>(`/admin/products/${slotFor.id}/slots`));
      load();
    } catch (e: any) {
      setMsg(`실패: ${e.message}`);
    }
  }

  async function toggleSlot(s: any) {
    await api(`/admin/slots/${s.id}`, { method: 'PATCH', body: { isOpen: !s.isOpen } });
    setSlots(await api<any[]>(`/admin/products/${slotFor.id}/slots`));
  }

  async function deleteSlot(s: any) {
    if (!confirm('이 회차를 삭제할까요?')) return;
    try {
      await api(`/admin/slots/${s.id}`, { method: 'DELETE' });
      setSlots(await api<any[]>(`/admin/products/${slotFor.id}/slots`));
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function saveSlotEdit() {
    try {
      const startAt = new Date(`${slotEdit.date}T${slotEdit.time}:00`);
      await api(`/admin/slots/${slotEdit.id}`, {
        method: 'PATCH',
        body: {
          startAt: startAt.toISOString(),
          durationMinutes: Number(slotEdit.durationMinutes),
          capacity: Number(slotEdit.capacity),
        },
      });
      setSlotEdit(null);
      setSlots(await api<any[]>(`/admin/products/${slotFor.id}/slots`));
    } catch (e: any) {
      alert(e.message);
    }
  }

  const inputCls = 'h-9 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">상품 · 예약</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          {tab === 'products' && (
            <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '닫기' : '＋ 상품 등록'}</Button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-line">
        {([['products', '상품 목록'], ['reservations', '예약 목록']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === key ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <>
          {(rows ?? []).some((p) => p.approval === 'PENDING') && (
            <Card>
              <CardHeader title={`점주 등록 승인 대기 (${(rows ?? []).filter((p) => p.approval === 'PENDING').length})`} />
              <Table head={['가맹점', '상품', '유형', '정상가', '멤버십가', '처리']}>
                {(rows ?? []).filter((p) => p.approval === 'PENDING').map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap font-medium">{p.merchant.name}</Td>
                    <Td className="max-w-[260px]">
                      <div className="flex items-center gap-2.5">
                        <Thumb src={p.imageUrl} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.name}</div>
                          <div className="truncate text-xs text-ink-3">{p.description}</div>
                        </div>
                      </div>
                    </Td>
                    <Td><Badge>{TYPE_LABEL[p.type] ?? p.type}</Badge></Td>
                    <Td className="tabular-nums">{won(p.basePrice)}</Td>
                    <Td className="tabular-nums">{p.memberPrice != null ? won(p.memberPrice) : '—'}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button small onClick={() => approveProduct(p)}>승인</Button>
                        <Button small variant="danger" onClick={() => rejectProduct(p)}>반려</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {showCreate && (
            <Card className="p-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <select className={inputCls} value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })}>
                  <option value="">가맹점 선택</option>
                  {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input className={`${inputCls} lg:col-span-2`} placeholder="상품명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="RESERVATION">예약형 (시간 선택)</option>
                  <option value="TICKET">티켓 (기간 내 사용)</option>
                  <option value="PASS">PASS (혜택 자동오픈)</option>
                </select>
                <input className={inputCls} placeholder="정상가" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value.replace(/\D/g, '') })} />
                <input className={inputCls} placeholder="멤버십가(선택)" value={form.memberPrice} onChange={(e) => setForm({ ...form, memberPrice: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select className={inputCls} value={form.verification} onChange={(e) => setForm({ ...form, verification: e.target.value })}>
                  <option value="QR_ONLY">현장 검증: QR만</option>
                  <option value="QR_PIN">현장 검증: QR+직원확인 (고가 상품)</option>
                </select>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
                <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                  {image ? '사진 변경' : '📁 상품 사진'}
                </Button>
                {image && <img src={image} alt="미리보기" className="h-9 w-12 rounded object-cover" />}
                <Button onClick={createProduct} disabled={!form.merchantId || form.name.length < 2 || !form.basePrice}>등록</Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={`상품 목록 (${rows?.length ?? '…'})`} />
            {rows === null ? (
              <TableSkeleton rows={6} cols={7} />
            ) : rows.length === 0 ? (
              <Empty text="등록된 상품이 없습니다" />
            ) : (
              <Table head={['상태', '가맹점', '상품명', '유형', '정상가', '멤버십가', '검증', '회차', '관리']}>
                {rows.map((p) => (
                  <tr key={p.id} className={p.approval === 'REJECTED' ? 'opacity-60' : ''}>
                    <Td>
                      <Badge>{p.approval === 'PENDING' ? 'PENDING' : p.approval === 'REJECTED' ? 'REJECTED' : p.isActive ? 'ACTIVE' : 'CLOSED'}</Badge>
                      {p.approval === 'REJECTED' && p.rejectReason && (
                        <div className="mt-1 max-w-[120px] text-[11px] text-bad">반려: {p.rejectReason}</div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{p.merchant.name}</Td>
                    <Td className="max-w-[240px]">
                      <div className="flex items-center gap-2.5">
                        <Thumb src={p.imageUrl} />
                        <span className="truncate font-medium">{p.name}</span>
                      </div>
                    </Td>
                    <Td><Badge>{TYPE_LABEL[p.type] ?? p.type}</Badge></Td>
                    <Td className="tabular-nums">{won(p.basePrice)}</Td>
                    <Td className="tabular-nums">{p.memberPrice != null ? won(p.memberPrice) : <span className="text-ink-3">—</span>}</Td>
                    <Td className="text-xs">{VERIF_LABEL[p.verification]}</Td>
                    <Td className="tabular-nums text-xs">
                      {p.type === 'RESERVATION' ? `${p._count.slots}개` : <span className="text-ink-3">—</span>}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {p.type === 'RESERVATION' && (
                          <Button small onClick={() => openSlots(p)}>회차 관리</Button>
                        )}
                        <label className="cursor-pointer">
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => changeImage(p, e)} />
                          <span className="inline-block rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-ground">사진</span>
                        </label>
                        {p.approval === 'PENDING' ? (
                          <Button small onClick={() => approveProduct(p)}>승인</Button>
                        ) : p.approval === 'REJECTED' ? (
                          <Button small onClick={() => approveProduct(p)}>재승인</Button>
                        ) : (
                          <Button small variant={p.isActive ? 'danger' : 'primary'} onClick={() => toggleActive(p)}>
                            {p.isActive ? '중지' : '재개'}
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'reservations' && (
        <Card>
          <CardHeader
            title={`예약 목록 (${reservations?.length ?? '…'})`}
            right={
              <select className={inputCls} value={resvFilter} onChange={(e) => setResvFilter(e.target.value)}>
                <option value="">전체 상품</option>
                {(rows ?? []).filter((p) => p.type === 'RESERVATION').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            }
          />
          {reservations === null ? (
            <TableSkeleton rows={6} cols={6} />
          ) : reservations.length === 0 ? (
            <Empty text="예약이 없습니다" />
          ) : (
            <Table head={['상태', '상품', '회차', '예약자', '인원', '연락처', '예약 시각']}>
              {reservations.map((r) => (
                <tr key={r.id}>
                  <Td><Badge>{RESV_LABEL[r.status] ?? r.status}</Badge></Td>
                  <Td className="max-w-[200px]">
                    <div className="truncate font-medium">{r.product.name}</div>
                    <div className="text-xs text-ink-3">{r.product.merchant.name}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">{dt(r.slot.startAt)}</Td>
                  <Td>{r.contactName || r.user.nickname}</Td>
                  <Td className="tabular-nums">{r.headcount}명</Td>
                  <Td className="text-xs">{r.contactPhone || '-'}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-3">{dt(r.createdAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {slotFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSlotFor(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
            <CardHeader
              title={`${slotFor.name} — 예약 회차`}
              right={<Button small variant="ghost" onClick={() => setSlotFor(null)}>닫기</Button>}
            />
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <input type="date" className={inputCls} value={slotForm.date} onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })} />
              <input type="time" className={inputCls} value={slotForm.time} onChange={(e) => setSlotForm({ ...slotForm, time: e.target.value })} />
              <select className={inputCls} value={slotForm.durationMinutes} onChange={(e) => setSlotForm({ ...slotForm, durationMinutes: e.target.value })}>
                <option value="60">60분</option><option value="90">90분</option>
                <option value="120">120분</option><option value="180">180분</option>
              </select>
              <input className={`${inputCls} w-24`} placeholder="정원" value={slotForm.capacity} onChange={(e) => setSlotForm({ ...slotForm, capacity: e.target.value.replace(/\D/g, '') })} />
              <button
                onClick={addSlot}
                disabled={!slotForm.date || !slotForm.capacity}
                className="h-9 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-40"
              >
                회차 추가
              </button>
            </div>
            {slots === null ? (
              <TableSkeleton rows={4} cols={5} />
            ) : slots.length === 0 ? (
              <Empty text="등록된 회차가 없습니다. 위에서 추가하세요." />
            ) : (
              <Table head={['시작', '종료', '예약/정원', '상태', '관리']}>
                {slots.map((s) => (
                  <tr key={s.id}>
                    <Td className="whitespace-nowrap">{dt(s.startAt)}</Td>
                    <Td className="whitespace-nowrap text-ink-3">{dt(s.endAt)}</Td>
                    <Td className="tabular-nums">{s.reserved}/{s.capacity}명</Td>
                    <Td><Badge>{s.isOpen ? 'OPEN' : 'CLOSED'}</Badge></Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button
                          small variant="ghost"
                          onClick={() => {
                            const st = new Date(s.startAt);
                            const dur = Math.round((new Date(s.endAt).getTime() - st.getTime()) / 60_000);
                            setSlotEdit({
                              id: s.id,
                              date: st.toISOString().slice(0, 10),
                              time: st.toTimeString().slice(0, 5),
                              durationMinutes: String(dur),
                              capacity: String(s.capacity),
                              reserved: s.reserved,
                            });
                          }}
                        >
                          수정
                        </Button>
                        <Button small variant={s.isOpen ? 'danger' : 'primary'} onClick={() => toggleSlot(s)}>
                          {s.isOpen ? '마감' : '오픈'}
                        </Button>
                        <Button small variant="danger" onClick={() => deleteSlot(s)}>삭제</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}

      {slotEdit && (
        <Modal title="회차 수정" onClose={() => setSlotEdit(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">날짜</label>
                <input type="date" className={`${inputCls} w-full`} value={slotEdit.date} onChange={(e) => setSlotEdit({ ...slotEdit, date: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">시작 시각</label>
                <input type="time" className={`${inputCls} w-full`} value={slotEdit.time} onChange={(e) => setSlotEdit({ ...slotEdit, time: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">소요(분)</label>
                <input className={`${inputCls} w-full`} value={slotEdit.durationMinutes} onChange={(e) => setSlotEdit({ ...slotEdit, durationMinutes: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">정원 {slotEdit.reserved > 0 && <span className="text-warn">(예약 {slotEdit.reserved}명 이상)</span>}</label>
                <input className={`${inputCls} w-full`} value={slotEdit.capacity} onChange={(e) => setSlotEdit({ ...slotEdit, capacity: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setSlotEdit(null)}>취소</Button>
              <Button onClick={saveSlotEdit}>저장</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
