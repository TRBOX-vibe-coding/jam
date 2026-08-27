'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, dt, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, Td } from '@/components/ui';

export default function DropsPage() {
  const [pending, setPending] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<any[]>('/admin/drops?status=PENDING').then(setPending).catch(() => {});
    api<any[]>('/admin/drops').then(setAll).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function approve(id: string) {
    const r = await api<{ status: string }>(`/admin/drops/${id}/approve`, { method: 'POST' });
    setMsg(`승인 완료 → ${r.status === 'OPEN' ? '즉시 오픈' : '오픈 예약'}`);
    load();
  }
  async function reject(id: string) {
    const reason = prompt('반려 사유를 입력하세요');
    if (!reason) return;
    await api(`/admin/drops/${id}/reject`, { method: 'POST', body: { reason } });
    setMsg('반려 처리했습니다');
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">DROP 관리</h1>
        {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
      </div>

      <Card>
        <CardHeader title={`승인 대기 (${pending.length})`} />
        {pending.length === 0 ? (
          <Empty text="승인 대기 중인 DROP이 없습니다" />
        ) : (
          <Table head={['가맹점', '제목', '가격', '수량', '기간', '처리']}>
            {pending.map((d) => (
              <tr key={d.id}>
                <Td className="whitespace-nowrap font-medium">{d.merchant.name}</Td>
                <Td className="max-w-[260px]">
                  <div className="truncate font-medium">{d.title}</div>
                  <div className="truncate text-xs text-ink-3">{d.description}</div>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  <span className="text-ink-3 line-through">{won(d.normalPrice)}</span>{' '}
                  <b>{won(d.dropPrice)}</b>
                </Td>
                <Td className="tabular-nums">{d.totalQty}개</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">
                  {dt(d.openAt)} ~ {dt(d.closeAt)}
                </Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Button small onClick={() => approve(d.id)}>승인</Button>
                    <Button small variant="danger" onClick={() => reject(d.id)}>반려</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="전체 DROP" />
        <Table head={['상태', '가맹점', '제목', '가격', '남은/전체', '마감', '광고']}>
          {all.map((d) => (
            <tr key={d.id}>
              <Td><Badge>{d.status}</Badge></Td>
              <Td className="whitespace-nowrap">{d.merchant.name}</Td>
              <Td className="max-w-[280px] truncate font-medium">{d.title}</Td>
              <Td className="whitespace-nowrap tabular-nums">
                {won(d.dropPrice)}{' '}
                <span className="text-xs text-ink-3">({Math.round((1 - d.dropPrice / d.normalPrice) * 100)}%↓)</span>
              </Td>
              <Td className="tabular-nums">{d.remainingQty}/{d.totalQty}</Td>
              <Td className="whitespace-nowrap text-xs text-ink-3">{dt(d.closeAt)}</Td>
              <Td>{d.isSponsored ? <Badge>SPONSORED</Badge> : <span className="text-xs text-ink-3">—</span>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
