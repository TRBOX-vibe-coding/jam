'use client';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api, fileToDataUrl, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';
import { QtyEdit } from '@/components/qty-edit';

const img = (u?: string | null, w = 160) => (u ? (u.startsWith('/') ? `${API_BASE}${u}?w=${w}` : u) : null);
const TYPE_LABEL: Record<string, string> = { TICKET: '티켓', RESERVATION: '예약형', PASS: 'PASS' };

const EMPTY = { type: 'RESERVATION', name: '', description: '', basePrice: '', memberPrice: '', verification: 'QR_ONLY', cancelPolicy: '', totalQty: '', slotCapacity: '' };

export default function MyProductsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<any[]>('/merchant/my/products').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function changeQty(id: string, totalQty: number) {
    try {
      const r = await api<{ message: string }>(`/merchant/my/products/${id}`, { method: 'PATCH', body: { totalQty } });
      setMsg(r.message);
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('이미지는 5MB 이하여야 합니다'); return; }
    setPhoto(await fileToDataUrl(file));
  }

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/merchant/my/products', {
        method: 'POST',
        body: {
          type: f.type,
          name: f.name,
          description: f.description || undefined,
          basePrice: Number(f.basePrice),
          memberPrice: f.memberPrice ? Number(f.memberPrice) : undefined,
          verification: f.verification,
          cancelPolicy: f.cancelPolicy || undefined,
          totalQty: f.type === 'TICKET' && f.totalQty ? Number(f.totalQty) : undefined,
          slotCapacity: f.type === 'RESERVATION' && f.slotCapacity ? Number(f.slotCapacity) : undefined,
          imageBase64: photo ?? undefined,
        },
      });
      setMsg(r.message);
      setF(EMPTY);
      setPhoto(null);
      setShowCreate(false);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';
  const valid = f.name.length >= 2 && Number(f.basePrice) >= 1000;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">내 상품</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '닫기' : '＋ 상품 등록'}</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        티켓·예약형 상품입니다. 등록하면 <b>본사 승인 후</b> 판매가 시작되고,
        예약형 상품의 <b>시간 회차</b>는 승인 후 본사가 함께 세팅해 드립니다.
      </p>

      {showCreate && (
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="RESERVATION">예약형 (시간 선택)</option>
              <option value="TICKET">티켓 (기간 내 사용)</option>
            </select>
            <input className={`${inputCls} col-span-2`} placeholder="상품명 * (예: 입문 서핑 강습 2시간)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <select className={inputCls} value={f.verification} onChange={(e) => setF({ ...f, verification: e.target.value })}>
              <option value="QR_ONLY">현장 검증: QR만</option>
              <option value="QR_PIN">QR+직원확인 (고가 상품)</option>
            </select>
            <input className={`${inputCls} col-span-2 lg:col-span-4`} placeholder="설명" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <input className={inputCls} placeholder="정상가 *" value={f.basePrice} onChange={(e) => setF({ ...f, basePrice: e.target.value.replace(/\D/g, '') })} />
            <input className={inputCls} placeholder="멤버십가 (선택)" value={f.memberPrice} onChange={(e) => setF({ ...f, memberPrice: e.target.value.replace(/\D/g, '') })} />
            {f.type === 'TICKET' ? (
              <input className={inputCls} placeholder="총 판매 수량 (비우면 무제한)" title="다 팔리면 자동 품절됩니다" value={f.totalQty} onChange={(e) => setF({ ...f, totalQty: e.target.value.replace(/\D/g, '') })} />
            ) : (
              <input className={inputCls} placeholder="회차당 정원 (예: 6)" title="시간 회차 하나에 받을 수 있는 인원" value={f.slotCapacity} onChange={(e) => setF({ ...f, slotCapacity: e.target.value.replace(/\D/g, '') })} />
            )}
            <input className={inputCls} placeholder="취소 정책 (예: 기상 악화 시 전액 환불)" value={f.cancelPolicy} onChange={(e) => setF({ ...f, cancelPolicy: e.target.value })} />
            <div className="col-span-2 flex items-center gap-2 lg:col-span-4">
              <label className="cursor-pointer whitespace-nowrap rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-ground">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} />
                {photo ? '📁 사진 변경' : '📁 사진 올리기'}
              </label>
              {photo && <img src={photo} alt="미리보기" className="h-9 w-12 rounded object-cover" />}
              <div className="flex-1" />
              <Button onClick={create} disabled={!valid || busy}>{busy ? '등록 중…' : '등록 요청 (본사 승인)'}</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={`내 상품 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="등록한 상품이 없습니다" />
        ) : (
          <Table head={['상태', '상품', '유형', '정상가', '멤버십가', '수량·회차']}>
            {rows.map((p) => (
              <tr key={p.id} className={p.approval === 'REJECTED' ? 'opacity-60' : ''}>
                <Td>
                  <Badge>{p.approval === 'PENDING' ? 'PENDING' : p.approval === 'REJECTED' ? 'REJECTED' : p.isActive ? 'ACTIVE' : 'CLOSED'}</Badge>
                  {p.approval === 'REJECTED' && p.rejectReason && (
                    <div className="mt-1 max-w-[140px] text-[11px] text-bad">반려: {p.rejectReason}</div>
                  )}
                </Td>
                <Td className="max-w-[280px]">
                  <div className="flex items-center gap-2.5">
                    {img(p.imageUrl) ? (
                      <img src={img(p.imageUrl)!} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-ground text-[10px] text-ink-3">사진없음</div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="truncate text-xs text-ink-3">{p.description}</div>
                    </div>
                  </div>
                </Td>
                <Td><Badge>{TYPE_LABEL[p.type] ?? p.type}</Badge></Td>
                <Td className="tabular-nums">{won(p.basePrice)}</Td>
                <Td className="tabular-nums">{p.memberPrice != null ? won(p.memberPrice) : <span className="text-ink-3">—</span>}</Td>
                <Td className="whitespace-nowrap tabular-nums text-xs">
                  {p.type === 'RESERVATION'
                    ? `회차 ${p._count.slots}개${p.defaultCapacity ? ` · 정원 ${p.defaultCapacity}명` : ''}`
                    : p.totalQty != null
                      ? <>남은 {Math.max(0, p.totalQty - p.soldQty)}/{p.totalQty}<QtyEdit current={p.totalQty} onSave={(q) => changeQty(p.id, q)} /></>
                      : <><span className="text-ink-3">무제한</span><QtyEdit current={0} onSave={(q) => changeQty(p.id, q)} /></>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
