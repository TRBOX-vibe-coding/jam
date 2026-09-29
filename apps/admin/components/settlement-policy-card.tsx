'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Button, Card, CardHeader } from '@/components/ui';

/**
 * 정산일 — 2026-09-29 사용자 결정: "날짜 지정이 맞다 — 매달 15일, 또는 매달 15일·30일. 그래야 관리자가 정산 관리가 쉽다."
 * 토스를 붙일 때 홀릭잼 대표가 정한 날짜로 맞추고, 바꿀 수 있다. 정산일마다 지난 정산일부터 그 전날까지
 * 가게에서 사용 처리된 것을 보낸다(결제한 날이 아니라 사용 처리한 날 기준).
 */
type Mode = 'one' | 'two';
const LAST = 31; // 말일
const DAYS = Array.from({ length: LAST }, (_, i) => i + 1);
const dayName = (d: number) => (d >= LAST ? '말일' : `${d}일`);
const md = (x: Date) => `${x.getMonth() + 1}월 ${x.getDate()}일`;
const dayBefore = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate() - 1);

/** 그달의 정산일 — 그달에 없는 날(예: 2월 30일)은 그달 말일 */
function payDatesOf(days: number[], y: number, m: number) {
  const dim = new Date(y, m + 1, 0).getDate();
  return [...new Set(days.map((d) => Math.min(d, dim)))].sort((a, b) => a - b).map((d) => new Date(y, m, d));
}

/** 이번 달 정산일마다 '언제부터 언제까지 사용분 → 며칠에 보냄' */
function examples(days: number[]) {
  const now = new Date();
  const prev = payDatesOf(days, now.getFullYear(), now.getMonth() - 1);
  const cur = payDatesOf(days, now.getFullYear(), now.getMonth());
  const all = [...prev, ...cur];
  return cur.map((pay, i) => `${md(all[prev.length + i - 1])}~${md(dayBefore(pay))} 사용분 → ${md(pay)}에 보냄`);
}

function DaySelect({ value, onChange, id }: { value: number; onChange: (d: number) => void; id: string }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-line bg-white px-2 py-1 text-sm font-bold"
    >
      {DAYS.map((d) => (
        <option key={d} value={d}>{dayName(d)}</option>
      ))}
    </select>
  );
}

export function SettlementPolicyCard() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('two');
  const [one, setOne] = useState(15);
  const [a, setA] = useState(15);
  const [b, setB] = useState(30);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ payDays: number[] }>('/admin/settings/settlement-policy')
      .then((r) => {
        if (r.payDays.length >= 2) {
          setMode('two');
          setA(r.payDays[0]);
          setB(r.payDays[1]);
        } else {
          setMode('one');
          setOne(r.payDays[0]);
        }
        setReady(true);
      })
      .catch(() => {});
  }, []);

  if (!ready) {
    return (
      <Card>
        <CardHeader title="정산일" />
        <div className="p-5 text-xs text-ink-3">불러오는 중…</div>
      </Card>
    );
  }

  const sameDay = mode === 'two' && a === b;
  const payDays = mode === 'one' ? [one] : [a, b].sort((x, y) => x - y);

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api<{ message: string }>('/admin/settings/settlement-policy', { method: 'PUT', body: { payDays } });
      setMsg(r.message);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const option = (key: Mode, label: string, pick: ReactNode, days: number[]) => (
    <label
      className={`block cursor-pointer rounded-lg border px-4 py-3 ${mode === key ? 'border-brand bg-brand-soft' : 'border-line bg-white'}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
        <input type="radio" name="payMode" checked={mode === key} onChange={() => setMode(key)} />
        {label}
        <span className="flex flex-wrap items-center gap-1.5 font-normal text-ink-2">매달 {pick}</span>
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-ink-3">
        {examples(days).map((t) => (
          <div key={t}>예) {t}</div>
        ))}
      </div>
    </label>
  );

  return (
    <Card>
      <CardHeader
        title="정산일"
        right={msg ? <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span> : undefined}
      />
      <div className="space-y-3 px-5 pb-5 pt-3">
        <p className="text-xs leading-5 text-ink-3">
          매달 가게에 정산금을 보내는 날을 고릅니다. 정산일마다 <b>지난 정산일부터 그 전날까지 가게에서 사용 처리된 것</b>을 보냅니다 —
          결제한 날이 아니라 사용 처리한 날이 기준입니다. 정산일 0시에 가게마다 정산이 <b>저절로</b> 만들어지고, 가게 정산 화면에 정산일과 지급 예정일이 보입니다.
          토스 지급대행을 붙일 때 홀릭잼이 정한 날짜로 맞춥니다.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {option('one', '한 달에 한 번', <DaySelect id="payday-one" value={one} onChange={(d) => { setOne(d); setMode('one'); }} />, [one])}
          {option(
            'two',
            '한 달에 두 번',
            <>
              <DaySelect id="payday-a" value={a} onChange={(d) => { setA(d); setMode('two'); }} />
              <span>과</span>
              <DaySelect id="payday-b" value={b} onChange={(d) => { setB(d); setMode('two'); }} />
            </>,
            sameDay ? [a] : [a, b],
          )}
        </div>
        {sameDay && <p className="text-xs font-semibold text-bad">한 달에 두 번이면 두 날짜를 서로 다르게 골라 주세요.</p>}
        <p className="text-[11px] text-ink-3">그달에 없는 날(예: 2월 30일)은 그달 말일에 보냅니다.</p>
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy || sameDay}>저장</Button>
        </div>
      </div>
    </Card>
  );
}
