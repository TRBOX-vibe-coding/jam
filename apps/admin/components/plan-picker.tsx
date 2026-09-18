'use client';
/**
 * 할인가를 받는 잼 고르기 — 2026-09-18 대표 확정.
 * 상품마다 어느 잼 회원에게 할인가를 줄지 정한다.
 * 아무것도 고르지 않으면 유료 잼이면 모두 받는다(지금까지의 동작).
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function PlanPicker({
  value,
  onChange,
  label = '유료 회원 할인가를 받는 잼',
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    api<any[]>('/admin/plans')
      .then((rows) => setPlans(rows.filter((p) => p.price > 0)))
      .catch(() => setPlans([]));
  }, []);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div className="rounded-lg border border-line bg-ground/50 p-3">
      <p className="mb-1 text-xs font-semibold text-ink-3">{label}</p>
      <p className="mb-2 text-[11px] text-ink-3">
        고르지 않으면 유료 잼 회원 모두가 할인가로 삽니다. 다낭 상품이라면 다낭잼만 고르세요.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              value.includes(p.id) ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-2'
            }`}
          >
            {p.name}
          </button>
        ))}
        {plans.length === 0 && <span className="text-xs text-ink-3">잼이 없습니다</span>}
      </div>
    </div>
  );
}
