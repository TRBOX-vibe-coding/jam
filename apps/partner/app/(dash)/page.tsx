'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, dt } from '@/lib/api';
import { Badge, Card, CardHeader, Empty, Stat, StatSkeleton, Table, TableSkeleton, Td } from '@/components/ui';

const TYPE_LABEL: Record<string, string> = { BENEFIT: '혜택', DROP: 'DROP', VOUCHER: '이용권' };

export default function Dashboard() {
  const [summary, setSummary] = useState<any | null>(null);
  const [redemptions, setRedemptions] = useState<any[] | null>(null);

  useEffect(() => {
    api<any>('/merchant/my/summary').then(setSummary).catch(() => {});
    api<any[]>('/merchant/my/redemptions?days=7').then(setRedemptions).catch(() => setRedemptions([]));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">대시보드</h1>

      {!summary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><StatSkeleton /><StatSkeleton /><StatSkeleton /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="오늘 사용" value={`${summary.todayRedemptions}건`} sub="손님 QR 사용 처리" />
          <Stat label="이번 달 사용" value={`${summary.monthRedemptions}건`} />
          <Stat label="진행 중 DROP" value={`${(summary.drops ?? []).filter((d: any) => d.status === 'OPEN').length}개`} sub={`승인 대기 ${(summary.drops ?? []).filter((d: any) => d.status === 'PENDING').length}건`} />
        </div>
      )}

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
