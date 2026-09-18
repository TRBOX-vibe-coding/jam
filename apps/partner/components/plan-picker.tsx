'use client';
/**
 * 할인가를 받는 잼 고르기 (점주용) — 2026-09-18 대표 확정.
 * 사장님이 자기 상품에 어느 잼 회원까지 할인가를 줄지 정한다.
 * 고르지 않으면 유료 잼 회원 모두가 할인가로 산다.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function PlanPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    api<any[]>('/membership/plans')
      .then((rows) => setPlans(rows.filter((p) => p.price > 0)))
      .catch(() => setPlans([]));
  }, []);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div className="col-span-2 rounded-lg border border-line bg-ground/50 p-3 lg:col-span-4">
      <p className="mb-1 text-xs font-semibold text-ink-3">유료 회원 할인가를 받는 잼</p>
      <p className="mb-2 text-[11px] text-ink-3">
        고르지 않으면 유료 잼 회원 모두가 할인가로 삽니다. 특정 잼 손님에게만 주려면 그 잼만 고르세요.
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
