'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, dt, won } from '@/lib/api';
import { Badge, Card, CardHeader, Empty, Stat, Table, Td } from '@/components/ui';

type Stats = {
  users: number; activeMemberships: number; activeMerchants: number;
  openDrops: number; pendingDrops: number;
  todayRedemptions: number; monthRedemptions: number;
  monthGmv: number; monthOrderCount: number; monthSavedAmount: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [redemptions, setRedemptions] = useState<any[]>([]);

  useEffect(() => {
    api<Stats>('/admin/stats').then(setStats).catch(() => {});
    api<any[]>('/admin/redemptions?days=7').then(setRedemptions).catch(() => {});
  }, []);

  if (!stats) return <p className="text-sm text-ink-3">불러오는 중…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-bold">대시보드</h1>
        {stats.pendingDrops > 0 && (
          <Link href="/drops" className="rounded-md bg-warn-soft px-3 py-1.5 text-xs font-semibold text-warn">
            승인 대기 DROP {stats.pendingDrops}건 →
          </Link>
        )}
      </div>

      {/* 가입보다 거래·사용·재방문을 앞에 둔다 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="이번 달 거래액 (GMV)" value={won(stats.monthGmv)} sub={`주문 ${stats.monthOrderCount}건`} />
        <Stat label="이번 달 현장 사용" value={`${stats.monthRedemptions}건`} sub={`오늘 ${stats.todayRedemptions}건`} />
        <Stat label="이번 달 고객 절약액" value={won(stats.monthSavedAmount)} sub="멤버십 가치의 증거" />
        <Stat label="오픈 중 DROP" value={`${stats.openDrops}개`} sub={`승인 대기 ${stats.pendingDrops}건`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="전체 회원" value={stats.users.toLocaleString()} />
        <Stat label="유효 멤버십" value={stats.activeMemberships.toLocaleString()} />
        <Stat label="운영 중 가맹점" value={stats.activeMerchants.toLocaleString()} />
        <Stat
          label="멤버십 전환율"
          value={stats.users ? `${Math.round((stats.activeMemberships / stats.users) * 100)}%` : '-'}
        />
      </div>

      <Card>
        <CardHeader title="최근 현장 사용 (7일)" />
        {redemptions.length === 0 ? (
          <Empty text="아직 사용 기록이 없습니다" />
        ) : (
          <Table head={['시각', '회원', '매장', '항목', '유형', '인원', '절약액', '상태']}>
            {redemptions.slice(0, 12).map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-ink-3">{dt(r.createdAt)}</Td>
                <Td>{r.user.nickname}</Td>
                <Td>{r.merchant.name}</Td>
                <Td className="max-w-[220px] truncate">
                  {r.userBenefit?.benefit.title ?? r.dropClaim?.drop.title ?? r.voucher?.product.name ?? '-'}
                </Td>
                <Td><Badge>{r.type}</Badge></Td>
                <Td className="tabular-nums">{r.headcount}명</Td>
                <Td className="tabular-nums">{won(r.savedAmount)}</Td>
                <Td><Badge>{r.status}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
