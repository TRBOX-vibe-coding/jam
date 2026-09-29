'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, CardHeader } from '@/components/ui';

/**
 * 정산 주기 — 2026-09-29 사용자 결정: 토스를 붙일 때 홀릭잼 대표가 정한 날짜로 맞추고, 바꿀 수 있게.
 * 여기서 정한 주기대로 기간이 끝나면 정산이 저절로 만들어지고, 가게 정산 화면에도 주기와 지급 예정일이 보인다.
 */
type Cycle = 'MONTHLY' | 'SEMI_MONTHLY' | 'WEEKLY';
type Policy = { cycle: Cycle; payDelayDays: number };

const OPTIONS: { key: Cycle; label: string; hint: string }[] = [
  { key: 'MONTHLY', label: '한 달에 한 번', hint: '1일~말일을 한 번에 정산합니다. 예) 9월 1~30일 → 10월 5일 지급' },
  { key: 'SEMI_MONTHLY', label: '한 달에 두 번', hint: '1~15일, 16일~말일로 나눠 정산합니다. 예) 9월 1~15일 → 9월 20일 지급' },
  { key: 'WEEKLY', label: '일주일에 한 번', hint: '월요일~일요일로 정산합니다. 예) 9월 22~28일 → 10월 3일 지급' },
];

export function SettlementPolicyCard() {
  const [p, setP] = useState<Policy | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Policy>('/admin/settings/settlement-policy').then((r) => setP({ cycle: r.cycle, payDelayDays: r.payDelayDays })).catch(() => {});
  }, []);

  if (!p) {
    return (
      <Card>
        <CardHeader title="정산 주기" />
        <div className="p-5 text-xs text-ink-3">불러오는 중…</div>
      </Card>
    );
  }

  async function save() {
    if (!p) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await api<{ message: string }>('/admin/settings/settlement-policy', { method: 'PUT', body: p });
      setMsg(r.message);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="정산 주기"
        right={msg ? <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span> : undefined}
      />
      <div className="space-y-3 px-5 pb-5 pt-3">
        <p className="text-xs text-ink-3">
          여기서 정한 주기대로 기간이 끝나면 가게마다 정산이 <b>저절로</b> 만들어지고, 가게 정산 화면에 주기와 지급 예정일이 보입니다.
          토스 지급대행을 붙일 때 홀릭잼이 정한 날짜로 맞춥니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((o) => (
            <label
              key={o.key}
              className={`cursor-pointer rounded-lg border px-4 py-3 ${p.cycle === o.key ? 'border-brand bg-brand-soft' : 'border-line bg-white'}`}
            >
              <div className="flex items-center gap-2 text-sm font-bold">
                <input type="radio" name="cycle" checked={p.cycle === o.key} onChange={() => setP({ ...p, cycle: o.key })} />
                {o.label}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-ink-3">{o.hint}</div>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-2">지급일</span>
          <span>기간이 끝나고</span>
          <input
            className="w-16 rounded-md border border-line bg-white px-2 py-1.5 text-right text-sm font-bold tabular-nums outline-none focus:border-brand"
            value={String(p.payDelayDays)}
            onChange={(e) => setP({ ...p, payDelayDays: Math.min(60, Number(e.target.value.replace(/\D/g, '')) || 0) })}
          />
          <span>일 뒤</span>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>저장</Button>
        </div>
      </div>
    </Card>
  );
}
