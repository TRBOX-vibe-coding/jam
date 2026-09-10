'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, dt } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Stat, StatSkeleton, Table, TableSkeleton, Td } from '@/components/ui';

const TYPE_LABEL: Record<string, string> = { BENEFIT: '혜택', DROP: 'DROP', VOUCHER: '이용권' };

export default function Dashboard() {
  const [summary, setSummary] = useState<any | null>(null);
  const [redemptions, setRedemptions] = useState<any[] | null>(null);
  const [usePin, setUsePin] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  const [sales, setSales] = useState<{ todayCount: number; rows: any[] } | null>(null);

  useEffect(() => {
    api<any>('/merchant/my/summary').then(setSummary).catch(() => {});
    api<any[]>('/merchant/my/redemptions?days=7').then(setRedemptions).catch(() => setRedemptions([]));
    api<any>('/merchant/my').then((m) => setUsePin(m.usePin ?? null)).catch(() => {});
    // 판매 알림 — 60초마다 새 판매를 확인한다 (2026-09-10 픽스)
    const loadSales = () => api<any>('/merchant/my/sales?days=2').then(setSales).catch(() => {});
    loadSales();
    const timer = setInterval(loadSales, 60_000);
    return () => clearInterval(timer);
  }, []);

  async function savePin() {
    try {
      const r = await api<{ usePin: string; message: string }>('/merchant/my/pin', { method: 'POST', body: { pin: pinInput.trim() } });
      setUsePin(r.usePin);
      setPinInput('');
      setPinMsg(r.message);
    } catch (e: any) {
      setPinMsg(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">대시보드</h1>

      {!summary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><StatSkeleton /><StatSkeleton /><StatSkeleton /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="🔔 오늘 판매" value={`${sales?.todayCount ?? 0}건`} sub="앱에서 결제·예약·딜 수령" />
          <Stat label="오늘 사용" value={`${summary.todayRedemptions}건`} sub="손님 QR 사용 처리" />
          <Stat label="이번 달 사용" value={`${summary.monthRedemptions}건`} />
          <Stat label="진행 중 DROP" value={`${(summary.drops ?? []).filter((d: any) => d.status === 'OPEN').length}개`} sub={`승인 대기 ${(summary.drops ?? []).filter((d: any) => d.status === 'PENDING').length}건`} />
        </div>
      )}

      {/* 사용 확인 코드 — 결제 상품을 QR 없이 처리할 때 손님이 입력하는 우리 매장 코드 (2026-09-08 픽스) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-sm font-bold">사용 확인 코드</div>
            <div className="mt-0.5 text-xs text-ink-3">
              손님이 결제 상품을 QR 없이 사용 처리할 때 입력하는 코드입니다. 자릿수 자유(2~10자) — 직원분들과 공유하세요.
            </div>
          </div>
          <div className="text-sm">
            현재: {usePin ? <b className="text-brand tracking-widest">{usePin}</b> : <span className="text-ink-3">미설정</span>}
          </div>
          <input
            className="w-28 rounded-md border border-line bg-white px-3 py-2 text-center text-sm font-bold tracking-widest outline-none focus:border-brand"
            placeholder="1234"
            maxLength={10}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
          />
          <Button small onClick={savePin} disabled={pinInput.trim().length < 2}>{usePin ? '변경' : '저장'}</Button>
          {pinMsg && <span className="text-xs font-semibold text-ok">{pinMsg}</span>}
        </div>
      </Card>

      {/* 판매 알림 피드 — 앱에서 팔리면 여기에 실시간(1분 주기)으로 쌓인다 */}
      <Card>
        <CardHeader title="🔔 최근 판매 (48시간)" />
        {sales === null ? (
          <TableSkeleton rows={3} cols={4} />
        ) : sales.rows.length === 0 ? (
          <Empty text="아직 판매가 없습니다. 판매되면 여기에 바로 표시돼요." />
        ) : (
          <Table head={['시각', '유형', '항목', '구매자', '내용']}>
            {sales.rows.slice(0, 8).map((s: any, i: number) => (
              <tr key={i}>
                <Td className="whitespace-nowrap text-ink-3">{dt(s.at)}</Td>
                <Td><Badge>{{ TICKET: '티켓', RESERVATION: '예약', DROP: '딜 수령', DROP_TICKET: '딜 결제' }[s.kind as string] ?? s.kind}</Badge></Td>
                <Td className="max-w-[260px] truncate font-medium">{s.title}</Td>
                <Td>{s.buyer}</Td>
                <Td className="text-xs text-ink-3">{s.extra}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="내 DROP 현황" right={<Link href="/drops" className="text-xs font-bold text-brand">전체 보기 →</Link>} />
        {!summary ? (
          <TableSkeleton rows={3} cols={4} />
        ) : (summary.drops ?? []).length === 0 ? (
          <Empty text="진행 중인 DROP이 없습니다. [내 DROP]에서 등록해 보세요." />
        ) : (
          <Table head={['상태', '딜', '남은/전체', '마감']}>
            {(summary.drops ?? []).slice(0, 5).map((d: any) => (
              <tr key={d.id}>
                <Td><Badge>{d.status}</Badge></Td>
                <Td className="max-w-[300px] truncate font-medium">{d.title}</Td>
                <Td className="tabular-nums">{d.remainingQty}/{d.totalQty}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">{dt(d.closeAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="최근 사용 내역 (7일)" right={<Link href="/redemptions" className="text-xs font-bold text-brand">전체 보기 →</Link>} />
        {redemptions === null ? (
          <TableSkeleton rows={5} cols={5} />
        ) : redemptions.length === 0 ? (
          <Empty text="아직 사용 기록이 없습니다" />
        ) : (
          <Table head={['시각', '항목', '유형', '고객', '인원']}>
            {redemptions.slice(0, 8).map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-ink-3">{dt(r.createdAt)}</Td>
                <Td className="max-w-[280px] truncate">
                  {r.voucher?.product.name ?? r.dropClaim?.drop.title ?? r.userBenefit?.benefit.title ?? '-'}
                </Td>
                <Td><Badge>{TYPE_LABEL[r.type] ?? r.type}</Badge></Td>
                <Td>{r.user.nickname}</Td>
                <Td className="tabular-nums">{r.headcount}명</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
