'use client';
/**
 * 이미 등록된 상품의 '할인 줄 잼' 바꾸기 — 2026-09-18 대표 확정.
 * 잼이 늘어나면 기존 상품의 대상도 손봐야 한다. 등록할 때만 고를 수 있으면 운영이 막힌다.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { PlanPicker } from '@/components/plan-picker';

export function ProductPlansModal({
  product,
  onClose,
}: {
  product: { id: string; name: string; memberPrice: number | null; memberPricePlanIds?: string[] };
  onClose: (saved?: boolean) => void;
}) {
  const [ids, setIds] = useState<string[]>(product.memberPricePlanIds ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setIds(product.memberPricePlanIds ?? []);
  }, [product.id, product.memberPricePlanIds]);

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH',
        body: { memberPricePlanIds: ids },
      });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`할인 줄 잼 — ${product.name}`} onClose={() => onClose(false)}>
      {product.memberPrice == null ? (
        <p className="mb-3 text-[13px] leading-5 text-warn">
          이 상품은 유료 회원 할인가가 없습니다. 먼저 할인가를 넣어야 잼을 고르는 의미가 있습니다.
        </p>
      ) : (
        <p className="mb-3 text-[13px] leading-5 text-ink-2">
          고른 잼을 가진 손님만 <b className="text-ink">{product.memberPrice.toLocaleString()}원</b>으로 삽니다.
          고르지 않으면 유료 잼 회원 모두가 할인가로 삽니다.
        </p>
      )}

      <PlanPicker value={ids} onChange={setIds} label="할인가를 받는 잼" />

      {msg && <p className="mt-2 text-[13px] text-bad">{msg}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(false)}>취소</Button>
        <Button onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </Modal>
  );
}
