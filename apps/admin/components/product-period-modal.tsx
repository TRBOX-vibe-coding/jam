'use client';
/**
 * 상품 판매 기간·이용 기간 — 2026-09-19 문서 4-6, 대표가 '오픈 전 필수'로 체크.
 *
 * 판매 기간 밖이면 손님이 결제할 수 없고 앱 목록에서도 빠진다.
 * 이용 기간을 넣으면 이용권을 그 기간에만 쓰고, 비우면 산 날부터 30일 동안 쓴다.
 * 이용 시작일이 있는 티켓은 '날짜 있는 티켓'(불꽃축제 등)이라 취소 규정이 이용일 기준으로 바뀐다.
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Modal } from '@/components/ui';

type Period = { saleFrom: string | null; saleTo: string | null; useFrom: string | null; useTo: string | null };

const dateCls = 'h-9 rounded-md border border-line bg-white px-2.5 text-sm outline-none focus:border-brand';

export function ProductPeriodModal({
  product,
  onClose,
}: {
  product: { id: string; name: string; type: string; period?: Period | null };
  onClose: (saved?: boolean) => void;
}) {
  const p = product.period;
  const [f, setF] = useState({
    saleFrom: p?.saleFrom ?? '', saleTo: p?.saleTo ?? '', useFrom: p?.useFrom ?? '', useTo: p?.useTo ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const isResv = product.type === 'RESERVATION';

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH',
        body: isResv ? { saleFrom: f.saleFrom, saleTo: f.saleTo } : f,
      });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, a: 'saleFrom' | 'useFrom', b: 'saleTo' | 'useTo', hint: string) => (
    <div className="rounded-lg border border-line bg-ground/50 p-3">
      <p className="mb-2 text-xs font-semibold text-ink-3">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className={dateCls} value={f[a]} onChange={(e) => setF({ ...f, [a]: e.target.value })} aria-label={`${label} 시작일`} />
        <span className="text-ink-3">~</span>
        <input type="date" className={dateCls} value={f[b]} onChange={(e) => setF({ ...f, [b]: e.target.value })} aria-label={`${label} 끝나는 날`} />
        {(f[a] || f[b]) && (
          <button type="button" onClick={() => setF({ ...f, [a]: '', [b]: '' })} className="text-xs font-semibold text-ink-3 underline underline-offset-2">
            비우기
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-ink-3">{hint}</p>
    </div>
  );

  return (
    <Modal title={`판매·이용 기간 — ${product.name}`} onClose={() => onClose(false)}>
      <div className="space-y-3">
        {row('판매 기간', 'saleFrom', 'saleTo', '이 기간에만 결제됩니다. 기간 밖이면 앱 목록에서도 빠집니다. 끝나는 날은 그 날 23:59까지. 비우면 제한 없음.')}
        {isResv ? (
          <p className="rounded-lg border border-line bg-ground/50 p-3 text-[12px] leading-5 text-ink-3">
            예약 상품은 손님이 고른 회차가 곧 이용일이라 이용 기간을 따로 넣지 않습니다.
          </p>
        ) : (
          row('이용 기간', 'useFrom', 'useTo', "이용권을 이 기간에만 쓸 수 있습니다. 비우면 산 날부터 30일. 이용 시작일을 넣으면 '날짜 있는 티켓'(불꽃축제 등)이 되어 취소 규정이 이용일 기준(이틀 전 전액 · 하루 전 50% · 당일 환불 없음)으로 바뀝니다.")
        )}
      </div>
      {msg && <p className="mt-2 text-[13px] text-bad">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(false)}>취소</Button>
        <Button onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </Modal>
  );
}
