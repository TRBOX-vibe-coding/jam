'use client';
/**
 * 상품 수량 제한 — 2026-09-24 대표 확정 3-3 "둘 다 필요".
 *  - 총 판매 수량: 다 팔리면 저절로 품절 (한 업체당 한정 수량)
 *  - 한 사람당 수량: 기획전의 '1인 1장' 같은 조건
 * 비우면 제한이 없다.
 */
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Modal } from '@/components/ui';

const inputCls =
  'h-9 w-28 rounded-md border border-line bg-white px-3 text-right text-sm font-bold tabular-nums outline-none focus:border-brand';

export function ProductQtyModal({
  product,
  onClose,
}: {
  product: { id: string; name: string; type: string; totalQty: number | null; soldQty: number; maxPerUser: number | null };
  onClose: (saved?: boolean) => void;
}) {
  const [total, setTotal] = useState(product.totalQty != null ? String(product.totalQty) : '');
  const [perUser, setPerUser] = useState(product.maxPerUser != null ? String(product.maxPerUser) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const isResv = product.type === 'RESERVATION';

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH',
        body: {
          // 0을 보내면 제한 없음으로 돌린다
          ...(isResv ? {} : { totalQty: total ? Number(total) : 0 }),
          maxPerUser: perUser ? Number(perUser) : 0,
        },
      });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`수량 제한 · ${product.name}`} onClose={() => onClose(false)}>
      <div className="space-y-4 text-sm">
        {isResv ? (
          <p className="rounded-lg bg-ground px-3 py-2 text-xs text-ink-2">
            예약 상품은 회차마다 정원이 있어서 총 판매 수량 대신 회차 정원으로 인원이 막힙니다.
          </p>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-3">총 판매 수량 — 다 팔리면 저절로 품절</span>
            <span className="flex items-center gap-2">
              <input className={inputCls} value={total} placeholder="무제한" onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} />
              <span className="text-ink-2">장</span>
              <span className="text-xs text-ink-3">지금까지 {product.soldQty}장 팔림 · 비우면 무제한</span>
            </span>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-3">한 사람당 살 수 있는 수량 — 예) 기획전 1인 1장</span>
          <span className="flex items-center gap-2">
            <input className={inputCls} value={perUser} placeholder="제한 없음" onChange={(e) => setPerUser(e.target.value.replace(/\D/g, ''))} />
            <span className="text-ink-2">장까지</span>
            <span className="text-xs text-ink-3">비우면 제한 없음 · 취소한 건은 세지 않습니다</span>
          </span>
        </label>
        {msg && <p className="text-[13px] text-bad">{msg}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onClose(false)}>닫기</Button>
          <Button onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
        </div>
      </div>
    </Modal>
  );
}
