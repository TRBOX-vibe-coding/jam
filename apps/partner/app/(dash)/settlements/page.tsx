'use client';
import { useEffect, useState } from 'react';
import { api, won } from '@/lib/api';
import { Badge, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';

const STATUS_LABEL: Record<string, string> = { PENDING: '정산 예정', CONFIRMED: '확정', PAID: '지급 완료' };

const d = (s: string) => new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
/** 정산 끝나는 날 — '다음 날 0시'로 저장된 줄도 그 전날로 보이게 1밀리초 앞으로 */
const dEnd = (s: string) => d(new Date(new Date(s).getTime() - 1).toISOString());

export default function SettlementsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  // 정산일 — 본사가 정한 매달 정산일 (2026-09-29)
  const [policy, setPolicy] = useState<{ label: string; note: string } | null>(null);

  useEffect(() => {
    api<any[]>('/merchant/my/settlements').then(setRows).catch(() => setRows([]));
    api<{ label: string; note: string }>('/merchant/my/settlement-policy').then(setPolicy).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">정산</h1>
      {policy && (
        <div className="rounded-lg bg-brand-soft px-4 py-2.5 text-sm text-ink-2">
          <b className="text-ink">정산일</b> · {policy.label}
          <div className="mt-0.5 text-xs text-ink-3">{policy.note}</div>
        </div>
      )}
      <p className="text-xs text-ink-3">
        홀릭잼에서 결제된 매출의 정산 내역입니다. 결제한 날이 아니라 <b>가게에서 사용 처리한 날</b>을 기준으로 정산하고, 지급 완료 전 내역은 <b>확정 후 정산일에 지급</b>됩니다.
        손님이 취소하고 규정대로 돌려받지 않은 돈(예: 하루 전 취소로 남은 50%)도 <b>사장님 몫</b>으로 정산되고, 홀릭잼은 수수료만 뗍니다.
      </p>

      {/* 정산 보류 — 본사가 보류하면 이유와 함께 보인다 (2026-09-24 대표 확정 2-2 B) */}
      {rows?.some((s) => s.heldAt) && (
        <div className="rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          <b>보류된 정산이 있습니다.</b> 본사가 확인을 마치면 바로 보내 드립니다.
          {rows.filter((s) => s.heldAt).map((s) => (
            <div key={s.id} className="mt-1 text-[13px]">· {d(s.periodStart)} ~ {dEnd(s.periodEnd)} — {s.holdReason}</div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title={`정산 내역 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="정산 내역이 없습니다. 홀릭잼 결제 매출이 생기면 여기에 표시됩니다." />
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
                <Td className="whitespace-nowrap">{d(s.periodStart)} ~ {dEnd(s.periodEnd)}</Td>
                <Td className="tabular-nums">
                  {won(s.grossAmount)}
                  {s.cancelKeptAmount > 0 && <div className="text-[11px] text-ink-3">취소로 남은 돈 {won(s.cancelKeptAmount)} 포함</div>}
                </Td>
                <Td className="tabular-nums text-ink-3">-{won(s.feeAmount)}</Td>
                <Td className="tabular-nums font-bold">{won(s.netAmount)}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">
                  {s.paidAt ? d(s.paidAt) : s.payDueAt ? <span>예정 {d(s.payDueAt)}</span> : '-'}
                </Td>
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
