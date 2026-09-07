'use client';
import { useEffect, useState } from 'react';
import { api, won } from '@/lib/api';
import { Badge, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';

const STATUS_LABEL: Record<string, string> = { PENDING: '정산 예정', CONFIRMED: '확정', PAID: '지급 완료' };

const d = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });

export default function SettlementsPage() {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    api<any[]>('/merchant/my/settlements').then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">정산</h1>
      <p className="text-xs text-ink-3">
        앱에서 결제된 매출의 정산 내역입니다. 지급 완료 전 내역은 <b>확정 후 순차 지급</b>됩니다.
      </p>

      <Card>
        <CardHeader title={`정산 내역 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="정산 내역이 없습니다. 앱 결제 매출이 생기면 여기에 표시됩니다." />
        ) : (
          <Table head={['상태', '정산 기간', '매출', '수수료', '지급액', '지급일', '메모']}>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td><Badge>{STATUS_LABEL[s.status] ?? s.status}</Badge></Td>
                <Td className="whitespace-nowrap">{d(s.periodStart)} ~ {d(s.periodEnd)}</Td>
                <Td className="tabular-nums">{won(s.grossAmount)}</Td>
                <Td className="tabular-nums text-ink-3">-{won(s.feeAmount)}</Td>
                <Td className="tabular-nums font-bold">{won(s.netAmount)}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">{s.paidAt ? d(s.paidAt) : '-'}</Td>
                <Td className="max-w-[200px] truncate text-xs text-ink-3">{s.memo || '-'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
