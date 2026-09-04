'use client';
import { useEffect, useState } from 'react';
import { api, dt } from '@/lib/api';
import { Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';

const ACTION_LABEL: Record<string, string> = {
  DROP_APPROVE: 'DROP 승인',
  DROP_REJECT: 'DROP 반려',
  MERCHANT_CREATE: '가맹점 등록',
  MERCHANT_UPDATE: '가맹점 수정',
  QR_ISSUE: 'QR 발급',
  REDEMPTION_CANCEL: '사용 취소(CS)',
  SETTLEMENT_GENERATE: '정산 생성',
  SETTLEMENT_CONFIRM: '정산 확정',
  CAMPAIGN_CREATE: '기획전 생성',
  CAMPAIGN_UPDATE: '기획전 수정',
  CAMPAIGN_DELETE: '기획전 삭제',
  CAMPAIGN_CLOSE: '기획전 종료',
  CAMPAIGN_PRODUCT_CREATE: '기획전 상품 등록',
};

export default function AuditPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    api<any[]>('/admin/audit').then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">감사 로그</h1>
      <p className="text-xs text-ink-3">상태를 바꾸는 모든 관리자 행동이 기록됩니다. 삭제할 수 없습니다.</p>
      <Card>
        <CardHeader title={`최근 기록 (${rows?.length ?? "…"})`} />
        {rows === null ? (
          <TableSkeleton rows={8} cols={5} />
        ) : rows.length === 0 ? (
          <Empty text="기록이 없습니다" />
        ) : (
          <Table head={['시각', '관리자', '행동', '대상', '메모']}>
            {rows.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-ink-3">{dt(l.createdAt)}</Td>
                <Td>{l.adminUser?.name ?? '-'}</Td>
                <Td className="font-medium">{ACTION_LABEL[l.action] ?? l.action}</Td>
                <Td className="text-xs text-ink-3">{l.targetType} · {l.targetId.slice(0, 10)}…</Td>
                <Td className="max-w-[280px] truncate text-xs">{l.memo ?? '-'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
