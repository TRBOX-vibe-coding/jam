'use client';
/**
 * 상품 수수료율 — 2026-09-29 대표 확정.
 * "가게에는 무조건 수수료만 떼는 거임. 수수료는 정할 수 있게 해야 함. 기본 10%이지만 상품에 따라 달라질 수 있음."
 * 비우면 가게 기본 수수료율(가맹점 [수정]에서 정함, 새 가게 10%)을 쓴다.
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Modal } from '@/components/ui';

export function ProductFeeModal({
  product,
  onClose,
}: {
  product: { id: string; name: string; commissionRate?: string | number | null; merchant: { name: string; commissionRate?: string | number | null } };
  onClose: (saved?: boolean) => void;
}) {
  const storeRate = product.merchant.commissionRate != null ? Number(product.merchant.commissionRate) : 10;
  const [v, setV] = useState(product.commissionRate != null ? String(Number(product.commissionRate)) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api(`/admin/products/${product.id}`, { method: 'PATCH', body: { commissionRate: v } });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`수수료 — ${product.name}`} onClose={() => onClose(false)}>
      <p className="mb-3 text-[13px] leading-5 text-ink-2">
        가게에는 판매액에서 <b className="text-ink">수수료만 떼고</b> 드립니다. 손님이 취소하고 규정대로 돌려받지 않은 돈(예: 하루 전 취소로 남은 50%)도
        가게 몫이고, 여기서도 수수료만 뗍니다.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink-3">이 상품 수수료율</span>
        <div className="flex items-center gap-2">
          <input
            className="h-10 w-28 rounded-md border border-line bg-white px-3 text-right text-sm font-bold tabular-nums outline-none focus:border-brand"
            inputMode="decimal"
            placeholder={String(storeRate)}
            value={v}
            onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))}
          />
          <span className="text-sm">%</span>
          {v !== '' && (
            <button type="button" onClick={() => setV('')} className="text-xs font-semibold text-ink-3 underline underline-offset-2">
              가게 기본으로
            </button>
          )}
        </div>
        <span className="mt-1.5 block text-[11px] text-ink-3">
          비우면 {product.merchant.name}의 기본 수수료율 <b>{storeRate}%</b>를 씁니다. 가게 기본은 가맹점 [수정]에서 바꿉니다.
        </span>
      </label>
      {msg && <p className="mt-2 text-[13px] text-bad">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(false)}>취소</Button>
        <Button onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </Modal>
  );
}
