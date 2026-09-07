'use client';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api, dt, getToken, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';
import { useMerchant } from '../layout';

const TYPE_LABEL: Record<string, string> = { BENEFIT: '혜택', DROP: 'DROP', VOUCHER: '이용권' };
const RANGES = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
];

export default function RedemptionsPage() {
  const merchant = useMerchant();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setRows(null);
    api<any[]>(`/merchant/my/redemptions?days=${days}`).then(setRows).catch(() => setRows([]));
  }, [days]);
  useEffect(load, [load]);

  /** 사무실 정리용 엑셀 */
  async function downloadExcel() {
    const res = await fetch(`${API_BASE}/merchant/my/report?days=${days === 1 ? 1 : days}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) { alert('다운로드에 실패했습니다'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${merchant?.name ?? '가맹점'}_사용내역_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg('엑셀을 내려받았습니다');
  }

  const total = rows?.filter((r) => r.status === 'DONE').length ?? 0;
  const saved = rows?.reduce((s, r) => s + (r.status === 'DONE' ? r.savedAmount : 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">사용 내역</h1>
        <div className="flex items-center gap-2">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                days === r.days ? 'bg-brand text-white' : 'bg-white text-ink-2 border border-line'
              }`}
            >
              {r.label}
            </button>
          ))}
          <Button small variant="ghost" onClick={downloadExcel}>엑셀 다운로드</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        기간 내 사용 <b>{total}건</b> · 고객에게 제공한 할인 합계 <b>{won(saved)}</b>
      </p>

      <Card>
        <CardHeader title={`사용 내역 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="이 기간에는 사용 기록이 없습니다" />
        ) : (
          <Table head={['시각', '항목', '유형', '고객', '인원', '할인액', '상태']}>
            {rows.map((r) => (
              <tr key={r.id} className={r.status !== 'DONE' ? 'opacity-50' : ''}>
                <Td className="whitespace-nowrap text-ink-3">{dt(r.createdAt)}</Td>
                <Td className="max-w-[300px] truncate font-medium">
                  {r.voucher?.product.name ?? r.dropClaim?.drop.title ?? r.userBenefit?.benefit.title ?? '-'}
                </Td>
                <Td><Badge>{TYPE_LABEL[r.type] ?? r.type}</Badge></Td>
                <Td>{r.user.nickname}</Td>
                <Td className="tabular-nums">{r.headcount}명</Td>
                <Td className="tabular-nums">{won(r.savedAmount)}</Td>
                <Td><Badge>{r.status === 'DONE' ? 'DONE' : 'CANCELLED'}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
