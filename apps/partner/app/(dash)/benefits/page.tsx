'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';

const TYPE_LABEL: Record<string, string> = { PERCENT: '% 할인', AMOUNT: '금액 할인', FREEBIE: '서비스 증정' };

const EMPTY = { title: '', type: 'PERCENT', value: '', freebieName: '', companionLimit: '', maxUsePerDay: '', minOrderAmount: '', conditions: '' };

function benefitValue(b: any) {
  if (b.type === 'PERCENT') return `${b.value}% 할인`;
  if (b.type === 'AMOUNT') return `${won(b.value)} 할인`;
  return `${b.freebieName ?? '서비스'} 증정`;
}

export default function MyBenefitsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<any[]>('/merchant/my/benefits').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/merchant/my/benefits', {
        method: 'POST',
        body: {
          title: f.title,
          type: f.type,
          value: f.type === 'FREEBIE' ? undefined : Number(f.value),
          freebieName: f.type === 'FREEBIE' ? f.freebieName : undefined,
          companionLimit: f.companionLimit ? Number(f.companionLimit) : undefined,
          maxUsePerDay: f.maxUsePerDay ? Number(f.maxUsePerDay) : undefined,
          minOrderAmount: f.minOrderAmount ? Number(f.minOrderAmount) : undefined,
          conditions: f.conditions || undefined,
        },
      });
      setMsg(r.message);
      setF(EMPTY);
      setShowCreate(false);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';
  const valid =
    f.title.length >= 2 &&
    (f.type === 'FREEBIE' ? f.freebieName.length >= 1 : Number(f.value) >= 1) &&
    (f.type !== 'PERCENT' || Number(f.value) <= 100) &&
    (f.type !== 'AMOUNT' || Number(f.value) >= 500);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">내 혜택</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '닫기' : '＋ 혜택 등록'}</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        멤버십 회원이 우리 가게에서 받는 상시 혜택입니다. 등록하면 <b>본사 승인 후</b> 앱에 노출됩니다.
      </p>

      {showCreate && (
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <input className={`${inputCls} col-span-2`} placeholder="혜택 이름 * (예: 멤버십 10% 할인)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, value: '', freebieName: '' })}>
              <option value="PERCENT">% 할인</option>
              <option value="AMOUNT">금액 할인</option>
              <option value="FREEBIE">서비스 증정</option>
            </select>
            {f.type === 'FREEBIE' ? (
              <input className={inputCls} placeholder="증정 품목 * (예: 아메리카노 1잔)" value={f.freebieName} onChange={(e) => setF({ ...f, freebieName: e.target.value })} />
            ) : (
              <input className={inputCls} placeholder={f.type === 'PERCENT' ? '할인율 * (1~100)' : '할인 금액 * (500원↑)'} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, '') })} />
            )}
            <input className={inputCls} placeholder="동반 적용 인원 (선택)" value={f.companionLimit} onChange={(e) => setF({ ...f, companionLimit: e.target.value.replace(/\D/g, '') })} />
            <input className={inputCls} placeholder="1일 사용 한도 (선택)" value={f.maxUsePerDay} onChange={(e) => setF({ ...f, maxUsePerDay: e.target.value.replace(/\D/g, '') })} />
            <input className={inputCls} placeholder="최소 주문금액 (선택)" value={f.minOrderAmount} onChange={(e) => setF({ ...f, minOrderAmount: e.target.value.replace(/\D/g, '') })} />
            <input className={inputCls} placeholder="이용 조건 (예: 주말 제외)" value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} />
            <div className="col-span-2 flex justify-end lg:col-span-4">
              <Button onClick={create} disabled={!valid || busy}>{busy ? '등록 중…' : '등록 요청 (본사 승인)'}</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={`내 혜택 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <Empty text="등록한 혜택이 없습니다" />
        ) : (
          <Table head={['상태', '혜택', '유형', '내용', '조건']}>
            {rows.map((b) => (
              <tr key={b.id} className={b.approval === 'REJECTED' ? 'opacity-60' : ''}>
                <Td>
                  <Badge>{b.approval === 'PENDING' ? 'PENDING' : b.approval === 'REJECTED' ? 'REJECTED' : b.isActive ? 'ACTIVE' : 'CLOSED'}</Badge>
                  {b.approval === 'REJECTED' && b.rejectReason && (
                    <div className="mt-1 max-w-[140px] text-[11px] text-bad">반려: {b.rejectReason}</div>
                  )}
                </Td>
                <Td className="max-w-[240px] truncate font-medium">{b.title}</Td>
                <Td><Badge>{TYPE_LABEL[b.type] ?? b.type}</Badge></Td>
                <Td className="whitespace-nowrap font-semibold">{benefitValue(b)}</Td>
                <Td className="max-w-[220px] truncate text-xs text-ink-3">
                  {[
                    b.companionLimit ? `동반 ${b.companionLimit}인` : null,
                    b.maxUsePerDay ? `1일 ${b.maxUsePerDay}회` : null,
                    b.minOrderAmount ? `${won(b.minOrderAmount)} 이상` : null,
                    b.conditions,
                  ].filter(Boolean).join(' · ') || '-'}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
