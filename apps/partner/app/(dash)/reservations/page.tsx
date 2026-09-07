'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, dt } from '@/lib/api';
import { Badge, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';

const RESV_LABEL: Record<string, string> = { REQUESTED: '요청', CONFIRMED: '확정', CANCELLED: '취소', NO_SHOW: '노쇼', COMPLETED: '완료' };

export default function ReservationsPage() {
  const [rows, setRows] = useState<any[] | null>(null);

  const load = useCallback(() => {
    api<any[]>('/merchant/my/reservations?days=60').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400_000);
  const todayList = (rows ?? []).filter((r) => {
    const s = new Date(r.slot.startAt);
    return s >= today && s < tomorrow && r.status === 'CONFIRMED';
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">예약</h1>
      <p className="text-xs text-ink-3">
        고객이 앱에서 결제하면 예약이 <b>자동 확정</b>되어 여기에 실시간으로 쌓입니다. 전화 확인이 필요 없어요.
      </p>

      {/* 오늘 이용 예정 — 사무실에서 아침에 확인하는 화면 */}
      <Card>
        <CardHeader title={`오늘 이용 예정 (${rows === null ? '…' : todayList.length})`} />
        {rows === null ? (
          <TableSkeleton rows={2} cols={5} />
        ) : todayList.length === 0 ? (
          <Empty text="오늘 이용 예정인 예약이 없습니다" />
        ) : (
          <Table head={['시간', '상품', '예약자', '인원', '연락처']}>
            {todayList.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap font-bold text-brand">
                  {new Date(r.slot.startAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </Td>
                <Td className="max-w-[240px] truncate font-medium">{r.product.name}</Td>
                <Td>{r.contactName || r.user.nickname}</Td>
                <Td className="tabular-nums">{r.headcount}명</Td>
                <Td className="text-xs">{r.contactPhone || '-'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title={`전체 예약 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="예약이 없습니다. [내 상품]에서 예약형 상품을 등록해 보세요." />
        ) : (
          <Table head={['상태', '이용 일시', '상품', '예약자', '인원', '연락처', '예약한 시각']}>
            {rows.map((r) => (
              <tr key={r.id} className={['CANCELLED', 'NO_SHOW'].includes(r.status) ? 'opacity-50' : ''}>
                <Td><Badge>{RESV_LABEL[r.status] ?? r.status}</Badge></Td>
                <Td className="whitespace-nowrap font-medium">{dt(r.slot.startAt)}</Td>
                <Td className="max-w-[220px] truncate">{r.product.name}</Td>
                <Td>{r.contactName || r.user.nickname}</Td>
                <Td className="tabular-nums">{r.headcount}명</Td>
                <Td className="text-xs">{r.contactPhone || '-'}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">{dt(r.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
