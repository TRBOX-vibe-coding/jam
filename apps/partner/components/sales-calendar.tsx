'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, won } from '@/lib/api';
import { Card, CardHeader, Empty } from '@/components/ui';

/**
 * 판매·이용 달력 — 숙박 PMS와 같은 방식.
 *
 * 날짜 칸에는 '손님이 이용한 날'을 넣는다. 예약형은 예약된 시각, 티켓·딜·쿠폰은 현장에서
 * 사용 처리한 시각이다. 날짜를 누르면 그날 전체가 시간순으로 펼쳐지고, 손님 이름을 누르면
 * 언제·얼마에 결제했고 어디에서 팔린 것인지가 나온다.
 */

type Entry = {
  id: string;
  kind: 'RESERVATION' | 'TICKET' | 'DROP' | 'BENEFIT';
  at: string;
  endAt: string | null;
  title: string;
  customer: string;
  phone: string | null;
  headcount: number;
  status: string;
  cancelled: boolean;
  used: boolean;
  payLabel: string;
  amount: number | null;
  paidAt: string | null;
  method: string | null;
  orderNo: string | null;
  savedAmount: number | null;
  source: string;
  memo: string | null;
};

const KIND_LABEL: Record<Entry['kind'], string> = {
  RESERVATION: '예약',
  TICKET: '이용권',
  DROP: '딜',
  BENEFIT: '쿠폰',
};
const KIND_CHIP: Record<Entry['kind'], string> = {
  RESERVATION: 'bg-warn-soft text-warn',
  TICKET: 'bg-brand-soft text-brand',
  DROP: 'bg-ok-soft text-ok',
  BENEFIT: 'bg-line text-ink-2',
};

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fullDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

export function SalesCalendar() {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [data, setData] = useState<{ entries: Entry[]; pending: { tickets: number; drops: number } } | null>(null);
  const [picked, setPicked] = useState<string>(key(today));
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    setData(null);
    api<any>(`/merchant/my/calendar?from=${key(first)}&to=${key(last)}`)
      .then(setData)
      .catch(() => setData({ entries: [], pending: { tickets: 0, drops: 0 } }));
  }, [month]);
  useEffect(load, [load]);

  const byDay = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const e of data?.entries ?? []) {
      const k = key(new Date(e.at));
      (map[k] ||= []).push(e);
    }
    return map;
  }, [data]);

  // 달력 칸 만들기 — 1일이 무슨 요일인지에 맞춰 앞을 비운다
  const cells: (Date | null)[] = [];
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDate = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const move = (delta: number) => {
    setOpenId(null);
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  };

  const dayList = (byDay[picked] ?? []).slice().sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const monthTotal = (data?.entries ?? []).filter((e) => !e.cancelled).length;
  const monthPeople = (data?.entries ?? []).filter((e) => !e.cancelled).reduce((s, e) => s + (e.headcount || 0), 0);

  return (
    <Card>
      <CardHeader
        title="달력"
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => move(-1)} className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-ground">◀</button>
            <span className="min-w-[88px] text-center text-sm font-bold">{month.getFullYear()}년 {month.getMonth() + 1}월</span>
            <button onClick={() => move(1)} className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-ground">▶</button>
            <button
              onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setPicked(key(today)); setOpenId(null); }}
              className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-ground"
            >오늘</button>
          </div>
        }
      />

      <div className="px-5 pb-2 text-xs text-ink-3">
        손님이 <b className="text-ink-2">이용한 날</b>에 표시됩니다. 예약은 예약된 시각에, 이용권·딜·쿠폰은 가게에서 사용 처리한 시각에 들어갑니다.
        {data && (
          <>
            {' '}이번 달 <b className="text-ink-2">{monthTotal}건 · {monthPeople}명</b>.
            {data.pending.tickets + data.pending.drops > 0 && (
              <> 아직 안 쓴 이용권 {data.pending.tickets}장{data.pending.drops > 0 ? `, 딜 ${data.pending.drops}개` : ''} — 손님이 오는 날이 정해지지 않아 달력에 없습니다.</>
            )}
          </>
        )}
      </div>

      <div className="px-5 pb-5">
        <div className="grid grid-cols-7 gap-px rounded-lg border border-line bg-line overflow-hidden">
          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
            <div key={w} className={`bg-ground py-1.5 text-center text-[11px] font-bold ${i === 0 ? 'text-bad' : i === 6 ? 'text-brand' : 'text-ink-3'}`}>{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="min-h-[104px] bg-ground/50" />;
            const k = key(d);
            const list = (byDay[k] ?? []).slice().sort((a, b) => +new Date(a.at) - +new Date(b.at));
            const isToday = k === key(today);
            const isPicked = k === picked;
            return (
              <button
                key={k}
                onClick={() => { setPicked(k); setOpenId(null); }}
                className={`min-h-[104px] bg-white p-1.5 text-left align-top transition ${isPicked ? 'ring-2 ring-inset ring-brand' : 'hover:bg-ground/60'}`}
              >
                <div className={`mb-1 text-[11px] font-bold ${isToday ? 'inline-block rounded bg-brand px-1.5 py-0.5 text-white' : d.getDay() === 0 ? 'text-bad' : 'text-ink-2'}`}>
                  {d.getDate()}
                </div>
                {list.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className={`mb-0.5 block truncate rounded px-1 py-0.5 text-[10px] font-bold ${KIND_CHIP[e.kind]} ${e.cancelled ? 'line-through opacity-50' : ''}`}
                  >
                    {hhmm(e.at)} {e.customer} {e.headcount}명
                  </span>
                ))}
                {list.length > 3 && <span className="block pl-1 text-[10px] font-bold text-ink-3">+{list.length - 3}건 더</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 고른 날 상세 */}
      <div className="border-t border-line px-5 py-4">
        <div className="mb-2 text-sm font-bold">
          {picked.replace(/-/g, '. ').replace(/\. 0/g, '. ')} 이용 내역 {dayList.length > 0 && <span className="text-ink-3">({dayList.length}건)</span>}
        </div>
        {data === null ? (
          <div className="py-6 text-center text-xs text-ink-3">불러오는 중…</div>
        ) : dayList.length === 0 ? (
          <Empty text="이 날에는 이용 내역이 없습니다" />
        ) : (
          <div className="divide-y divide-line">
            {dayList.map((e) => (
              <div key={e.id}>
                <button
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left hover:bg-ground/60"
                >
                  <span className="w-12 shrink-0 text-sm font-bold tabular-nums text-brand">{hhmm(e.at)}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${KIND_CHIP[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                  <span className={`text-sm font-bold ${e.cancelled ? 'text-ink-3 line-through' : ''}`}>{e.customer}</span>
                  <span className="rounded bg-ground px-1.5 py-0.5 text-[11px] font-bold text-ink-2">{e.payLabel}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{e.title}</span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-2">{e.headcount}명</span>
                  <span className="shrink-0 text-xs font-bold text-ink-3">{openId === e.id ? '접기 ▲' : '자세히 ▼'}</span>
                </button>

                {openId === e.id && (
                  <dl className="mb-3 grid grid-cols-[92px_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-ground px-4 py-3 text-sm sm:grid-cols-[92px_1fr_92px_1fr]">
                    <dt className="text-ink-3">결제 일시</dt><dd className="font-medium">{fullDateTime(e.paidAt)}</dd>
                    <dt className="text-ink-3">결제 금액</dt><dd className="font-bold tabular-nums">{e.amount != null ? won(e.amount) : e.savedAmount ? `무료 (${won(e.savedAmount)} 할인)` : '무료'}</dd>
                    <dt className="text-ink-3">판매 경로</dt><dd className="font-medium">{e.source}</dd>
                    <dt className="text-ink-3">결제 수단</dt><dd className="font-medium">{e.method || '-'}</dd>
                    <dt className="text-ink-3">주문번호</dt><dd className="font-medium tabular-nums">{e.orderNo || '-'}</dd>
                    <dt className="text-ink-3">상태</dt><dd className="font-medium">{e.status}</dd>
                    <dt className="text-ink-3">상품</dt><dd className="font-medium">{e.title}</dd>
                    <dt className="text-ink-3">연락처</dt><dd className="font-medium">{e.phone || '-'}</dd>
                    {e.memo && (<><dt className="text-ink-3">요청 사항</dt><dd className="font-medium">{e.memo}</dd></>)}
                  </dl>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
