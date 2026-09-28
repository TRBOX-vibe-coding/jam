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

      {/* 정산 보류 — 본사가 보류하면 이유와 함께 보인다 (2026-09-24 대표 확정 2-2 B) */}
      {rows?.some((s) => s.heldAt) && (
        <div className="rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          <b>보류된 정산이 있습니다.</b> 본사가 확인을 마치면 바로 보내 드립니다.
          {rows.filter((s) => s.heldAt).map((s) => (
            <div key={s.id} className="mt-1 text-[13px]">· {d(s.periodStart)} ~ {d(s.periodEnd)} — {s.holdReason}</div>
          ))}
        </div>
      )}

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
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                    {s.heldAt && <Badge>보류</Badge>}
                  </div>
                </Td>
                <Td className="whitespace-nowrap">{d(s.periodStart)} ~ {d(s.periodEnd)}</Td>
                <Td className="tabular-nums">{won(s.grossAmount)}</Td>
                <Td className="tabular-nums text-ink-3">-{won(s.feeAmount)}</Td>
                <Td className="tabular-nums font-bold">{won(s.netAmount)}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">{s.paidAt ? d(s.paidAt) : '-'}</Td>
                <Td className={`max-w-[240px] text-xs ${s.heldAt ? 'font-semibold text-bad' : 'truncate text-ink-3'}`}>
                  {s.heldAt ? `보류 · ${s.holdReason}` : s.memo || '-'}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
