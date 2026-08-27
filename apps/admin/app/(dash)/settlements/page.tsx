'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, Td } from '@/components/ui';

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

export default function SettlementsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<any[]>('/admin/settlements').then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function generate() {
    const { start, end } = monthRange(0);
    const r = await api<{ count: number }>('/admin/settlements/generate', {
      method: 'POST',
      body: { periodStart: start.toISOString(), periodEnd: end.toISOString() },
    });
    setMsg(`이번 달 정산 ${r.count}건 생성/갱신`);
    load();
  }

  async function confirm(id: string) {
    await api(`/admin/settlements/${id}/confirm`, { method: 'POST' });
    setMsg('정산 확정');
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">정산</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={generate}>이번 달 정산 생성</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        정산 기준: 기간 내 <b>현장에서 실제 사용된 이용권</b>의 판매액 × 가맹점별 수수료율. 상시 할인 혜택에는 수수료가 없습니다.
      </p>

      <Card>
        <CardHeader title="정산 내역" />
        {rows.length === 0 ? (
          <Empty text="생성된 정산이 없습니다. '이번 달 정산 생성'을 눌러 보세요." />
        ) : (
          <Table head={['상태', '가맹점', '기간', '판매액', '수수료', '지급액', '처리']}>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td><Badge>{s.status}</Badge></Td>
                <Td className="font-medium">{s.merchant.name}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">
                  {new Date(s.periodStart).toLocaleDateString('ko-KR')} ~{' '}
                  {new Date(s.periodEnd).toLocaleDateString('ko-KR')}
                </Td>
                <Td className="tabular-nums">{won(s.grossAmount)}</Td>
                <Td className="tabular-nums text-ink-3">-{won(s.feeAmount)}</Td>
                <Td className="tabular-nums font-semibold">{won(s.netAmount)}</Td>
                <Td>
                  {s.status === 'PENDING' ? (
                    <Button small onClick={() => confirm(s.id)}>확정</Button>
                  ) : (
                    <span className="text-xs text-ink-3">완료</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
