'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, dt, won } from '@/lib/api';
import { Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

/**
 * 주문·취소 — 2026-09-28 대표 확정 C 방식.
 * 손님이 카카오톡·전화로 취소를 요청하면 본사가 여기서 찾아 처리한다.
 * 실제 환불은 토스 상점관리자에서 하고, 여기서는 기록하고 자리·수량·쿠폰을 되돌린다.
 */

type Row = {
  id: string; orderNo: string; createdAt: string; paidAt: string | null; status: string;
  cancelledAt: string | null; refundAmount: number | null; cancelReason: string | null;
  kind: string; title: string; merchant: string; customer: string; phone: string | null;
  useAt: string | null; amount: number;
};

type Preview = {
  order: Row;
  paid: number;
  blockers: string[];
  warnings: string[];
  parts: { label: string; amount: number; percent: number; reason: string; refund: number }[];
  suggested: number;
};

const KIND_CHIP: Record<string, string> = {
  예약: 'bg-warn-soft text-warn',
  이용권: 'bg-brand-soft text-brand',
  잼: 'bg-ok-soft text-ok',
  딜: 'bg-line text-ink-2',
};

const inputCls = 'rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

export default function OrdersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [days, setDays] = useState(90);
  const [msg, setMsg] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [refund, setRefund] = useState('');
  const [reason, setReason] = useState('');
  const [tossDone, setTossDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((term = q) => {
    setRows(null);
    api<Row[]>(`/admin/orders?days=${days}${term.trim() ? `&q=${encodeURIComponent(term.trim())}` : ''}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [q, days]);
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openCancel(r: Row) {
    setMsg('');
    setTossDone(false);
    setReason('');
    try {
      const p = await api<Preview>(`/admin/orders/${r.id}/cancel-preview`);
      setPv(p);
      setRefund(String(p.suggested));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function doCancel() {
    if (!pv) return;
    setBusy(true);
    try {
      const r = await api<{ message: string }>(`/admin/orders/${pv.order.id}/cancel`, {
        method: 'POST',
        body: { refundAmount: Number(refund.replace(/\D/g, '')) || 0, reason: reason.trim() || undefined },
      });
      setMsg(r.message);
      setPv(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const refundNum = Number(refund.replace(/\D/g, '')) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">주문 · 취소</h1>
        {msg && <span className="max-w-[640px] rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
      </div>

      <Card className="p-5">
        <div className="text-sm font-bold">손님이 취소를 요청하면 이 순서로 처리합니다</div>
        <ol className="mt-2 grid gap-2 text-sm text-ink-2 sm:grid-cols-4">
          <li className="rounded-lg bg-ground px-3 py-2"><b className="text-ink">① 찾기</b><br />주문번호·이름·연락처로 주문을 찾습니다.</li>
          <li className="rounded-lg bg-ground px-3 py-2"><b className="text-ink">② 확인</b><br />[취소]를 누르면 규정상 돌려줄 금액이 나옵니다.</li>
          <li className="rounded-lg bg-ground px-3 py-2"><b className="text-ink">③ 환불</b><br />토스 상점관리자에서 그 금액만큼 환불합니다.</li>
          <li className="rounded-lg bg-ground px-3 py-2"><b className="text-ink">④ 기록</b><br />여기서 [취소 처리]를 누르면 자리·수량·쿠폰이 되돌아갑니다.</li>
        </ol>
        <p className="mt-3 text-xs text-ink-3">
          환불 비율과 결제 직후 전액 환불 시간은 <Link href="/settings" className="font-bold text-brand">설정 → 취소·환불 규정</Link>에서 바꿉니다.
          손님이 앱에서 직접 취소하는 기능은 오픈 후에 넣습니다.
        </p>
      </Card>

      <Card>
        <CardHeader
          title={`주문 (${rows?.length ?? '…'})`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${inputCls} w-64`}
                placeholder="주문번호 · 손님 이름 · 연락처"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
              <select className={inputCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={30}>최근 30일</option>
                <option value={90}>최근 90일</option>
                <option value={365}>최근 1년</option>
              </select>
              <Button small onClick={() => load()}>찾기</Button>
            </div>
          }
        />
        {rows === null ? (
          <TableSkeleton rows={8} cols={8} />
        ) : rows.length === 0 ? (
          <Empty text="찾는 주문이 없습니다" />
        ) : (
          <Table head={['결제 시각', '주문번호', '손님', '항목', '이용일', '금액', '상태', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-ink-3">{dt(r.paidAt ?? r.createdAt)}</Td>
                <Td className="whitespace-nowrap text-xs tabular-nums">{r.orderNo}</Td>
                <Td className="whitespace-nowrap">
                  <div className="font-medium">{r.customer}</div>
                  {r.phone && <div className="text-[11px] text-ink-3">{r.phone}</div>}
                </Td>
                <Td className="max-w-[280px]">
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${KIND_CHIP[r.kind] ?? 'bg-line text-ink-2'}`}>{r.kind}</span>
                    <span className="truncate font-medium">{r.title}</span>
                  </div>
                  <div className="truncate text-[11px] text-ink-3">{r.merchant}</div>
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">{r.useAt ? dt(r.useAt) : '-'}</Td>
                <Td className="whitespace-nowrap tabular-nums">{won(r.amount)}</Td>
                <Td className="whitespace-nowrap">
                  {r.status === 'PAID' ? (
                    <span className="rounded bg-ok-soft px-1.5 py-0.5 text-[11px] font-semibold text-ok">결제 완료</span>
                  ) : (
                    <div>
                      <span className="rounded bg-bad-soft px-1.5 py-0.5 text-[11px] font-semibold text-bad">취소됨</span>
                      <div className="mt-0.5 text-[11px] text-ink-3">환불 {won(r.refundAmount ?? 0)}</div>
                    </div>
                  )}
                </Td>
                <Td className="text-right">
                  {r.status === 'PAID' && <Button small variant="danger" onClick={() => openCancel(r)}>취소</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {pv && (
        <Modal title={`취소 — ${pv.order.orderNo}`} onClose={() => setPv(null)} wide>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1">
              <span className="text-ink-3">손님</span><span className="font-medium">{pv.order.customer}{pv.order.phone ? ` · ${pv.order.phone}` : ''}</span>
              <span className="text-ink-3">항목</span><span className="font-medium">{pv.order.title}</span>
              <span className="text-ink-3">가게</span><span>{pv.order.merchant || '-'}</span>
              <span className="text-ink-3">결제</span><span>{won(pv.paid)} · {dt(pv.order.paidAt ?? pv.order.createdAt)}</span>
            </div>

            {pv.blockers.length > 0 ? (
              <div className="rounded-lg border border-bad/30 bg-bad-soft px-4 py-3">
                <div className="font-bold text-bad">이 주문은 취소할 수 없습니다</div>
                <ul className="mt-1 list-disc pl-5 text-bad">
                  {pv.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-ground text-xs text-ink-3">
                      <tr><th className="px-3 py-2 text-left">항목</th><th className="px-3 py-2 text-left">규정</th><th className="px-3 py-2 text-right">돌려줄 금액</th></tr>
                    </thead>
                    <tbody>
                      {pv.parts.map((p, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-2">{p.label}<div className="text-[11px] text-ink-3">결제 {won(p.amount)}</div></td>
                          <td className="px-3 py-2 text-ink-2">{p.reason}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums">{won(p.refund)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pv.warnings.map((w, i) => (
                  <div key={i} className="rounded-lg bg-warn-soft px-4 py-2.5 text-warn">⚠ {w}</div>
                ))}
                <div className="rounded-lg bg-warn-soft px-4 py-2.5 text-warn">
                  가게에서 이미 쓰고 사용 처리를 안 했을 수 있습니다. 환불하기 전에 손님이 다녀갔는지 가게에 확인하세요.
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-ink-3">토스에서 돌려준 금액 (규정 {won(pv.suggested)})</span>
                    <input className={`${inputCls} w-full font-bold tabular-nums`} value={refund} onChange={(e) => setRefund(e.target.value.replace(/\D/g, ''))} />
                    {refundNum !== pv.suggested && (
                      <span className="mt-1 block text-[11px] text-warn">규정과 다른 금액입니다. 사유를 적어 주세요.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-ink-3">취소 사유</span>
                    <input className={`${inputCls} w-full`} value={reason} placeholder="예) 손님 일정 변경" onChange={(e) => setReason(e.target.value)} />
                  </label>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-line px-4 py-3">
                  <input type="checkbox" checked={tossDone} onChange={(e) => setTossDone(e.target.checked)} />
                  <span>토스 상점관리자에서 <b>{won(refundNum)}</b> 환불을 마쳤습니다.</span>
                </label>

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPv(null)}>닫기</Button>
                  <Button
                    variant="danger"
                    onClick={doCancel}
                    disabled={busy || !tossDone || refundNum > pv.paid || (refundNum !== pv.suggested && reason.trim().length < 2)}
                  >
                    {busy ? '처리 중…' : '취소 처리'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
