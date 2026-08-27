'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, dt, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, Td } from '@/components/ui';

const TYPE_LABEL: Record<string, string> = { TICKET: '티켓', RESERVATION: '예약형', PASS: 'PASS' };
const VERIF_LABEL: Record<string, string> = { QR_ONLY: 'QR만', QR_PIN: 'QR+직원확인', STAFF_CONFIRM: '직원확인' };

export default function ProductsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ merchantId: '', name: '', type: 'RESERVATION', basePrice: '', memberPrice: '', verification: 'QR_ONLY' });

  // 슬롯 패널
  const [slotFor, setSlotFor] = useState<any | null>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [slotForm, setSlotForm] = useState({ date: '', time: '10:00', durationMinutes: '120', capacity: '10' });

  const load = useCallback(() => {
    api<any[]>('/admin/products').then(setRows).catch(() => {});
    api<any[]>('/admin/merchants?status=ACTIVE').then(setMerchants).catch(() => {});
  }, []);
  useEffect(load, [load]);

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
        },
      });
      setMsg('상품 등록 완료');
      setShowCreate(false);
      setForm({ merchantId: '', name: '', type: 'RESERVATION', basePrice: '', memberPrice: '', verification: 'QR_ONLY' });
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

  async function openSlots(p: any) {
    setSlotFor(p);
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

  const inputCls = 'rounded-md border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">상품 · 예약</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '닫기' : '＋ 상품 등록'}</Button>
        </div>
      </div>

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
          <div className="mt-3 flex items-center gap-3">
            <select className={inputCls} value={form.verification} onChange={(e) => setForm({ ...form, verification: e.target.value })}>
              <option value="QR_ONLY">현장 검증: QR만</option>
              <option value="QR_PIN">현장 검증: QR+직원확인 (고가 상품)</option>
            </select>
            <Button onClick={createProduct} disabled={!form.merchantId || form.name.length < 2 || !form.basePrice}>등록</Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={`상품 목록 (${rows.length})`} />
        {rows.length === 0 ? (
          <Empty text="등록된 상품이 없습니다" />
        ) : (
          <Table head={['상태', '가맹점', '상품명', '유형', '정상가', '멤버십가', '검증', '회차', '관리']}>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td><Badge>{p.isActive ? 'ACTIVE' : 'CLOSED'}</Badge></Td>
                <Td className="whitespace-nowrap">{p.merchant.name}</Td>
                <Td className="max-w-[220px] truncate font-medium">{p.name}</Td>
                <Td><Badge>{TYPE_LABEL[p.type] ?? p.type}</Badge></Td>
                <Td className="tabular-nums">{won(p.basePrice)}</Td>
                <Td className="tabular-nums">{p.memberPrice != null ? won(p.memberPrice) : <span className="text-ink-3">—</span>}</Td>
                <Td className="text-xs">{VERIF_LABEL[p.verification]}</Td>
                <Td className="tabular-nums text-xs">
                  {p.type === 'RESERVATION' ? `${p._count.slots}개` : <span className="text-ink-3">—</span>}
                </Td>
                <Td>
                  <div className="flex gap-1.5">
                    {p.type === 'RESERVATION' && (
                      <Button small variant="ghost" onClick={() => openSlots(p)}>회차 관리</Button>
                    )}
                    <Button small variant={p.isActive ? 'danger' : 'primary'} onClick={() => toggleActive(p)}>
                      {p.isActive ? '중지' : '재개'}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {slotFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setSlotFor(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
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
              <Button small onClick={addSlot} disabled={!slotForm.date || !slotForm.capacity}>회차 추가</Button>
            </div>
            {slots.length === 0 ? (
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
                      <Button small variant={s.isOpen ? 'danger' : 'primary'} onClick={() => toggleSlot(s)}>
                        {s.isOpen ? '마감' : '오픈'}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
