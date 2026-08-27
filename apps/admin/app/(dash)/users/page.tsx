'use client';
import { useEffect, useState } from 'react';
import { api, dt } from '@/lib/api';
import { Badge, Card, CardHeader, Empty, Table, Td } from '@/components/ui';

export default function UsersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api<any[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setRows).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">회원</h1>
        <input
          placeholder="닉네임/이메일 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-56 rounded-md border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
      </div>

      <Card>
        <CardHeader title={`회원 목록 (${rows.length})`} />
        {rows.length === 0 ? (
          <Empty text="회원이 없습니다" />
        ) : (
          <Table head={['닉네임', '가입', '멤버십', '출처', '사용/주문', '최근 로그인']}>
            {rows.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="font-medium">{u.nickname}</div>
                  <div className="text-xs text-ink-3">{u.email ?? '-'}</div>
                </Td>
                <Td><Badge>{u.provider}</Badge></Td>
                <Td>
                  {u.memberships[0] ? (
                    <div>
                      <div className="text-[13px] font-medium">{u.memberships[0].plan.name}</div>
                      <div className="text-xs text-ink-3">~{dt(u.memberships[0].endAt)}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-3">일반회원</span>
                  )}
                </Td>
                <Td>{u.memberships[0] ? <Badge>{u.memberships[0].source}</Badge> : <span className="text-xs text-ink-3">—</span>}</Td>
                <Td className="tabular-nums text-xs text-ink-3">
                  사용 {u._count.redemptions} · 주문 {u._count.orders}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">
                  {u.lastLoginAt ? dt(u.lastLoginAt) : '-'}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
