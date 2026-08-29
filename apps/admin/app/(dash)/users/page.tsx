'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, dt } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Pagination, Table, TableSkeleton, Td } from '@/components/ui';

type Paged = { items: any[]; total: number; page: number; size: number; pages: number };

const STATUS_LABEL: Record<string, string> = { ACTIVE: '정상', DORMANT: '정지', WITHDRAWN: '탈퇴' };

export default function UsersPage() {
  const [data, setData] = useState<Paged | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState('');

  const load = useCallback((p = page, query = q) => {
    setLoading(true);
    api<Paged>(`/admin/users?page=${p}&size=20${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, q]);

  useEffect(() => {
    const t = setTimeout(() => load(1, q), 250);
    setPage(1);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => { load(page, q); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  async function setStatus(u: any, status: 'ACTIVE' | 'DORMANT' | 'WITHDRAWN') {
    const label = STATUS_LABEL[status];
    if (status !== 'ACTIVE' && !confirm(`${u.nickname} 회원을 '${label}' 처리할까요?`)) return;
    const reason = status !== 'ACTIVE' ? prompt('사유를 입력하세요 (감사 로그에 남습니다)') ?? undefined : undefined;
    if (status !== 'ACTIVE' && !reason) return;
    await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status, reason } });
    setMsg(`${u.nickname} → ${label} 처리`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">회원</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <input
            placeholder="닉네임/이메일 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-48 rounded-md border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-brand sm:w-56"
          />
        </div>
      </div>

      <p className="text-xs text-ink-3">
        회원은 소셜 간편가입 전용이라 비밀번호가 없어, 비밀번호 변경 조치는 해당되지 않습니다.
        삭제는 이력 보존을 위해 <b>탈퇴 처리(로그인 차단)</b>로 동작합니다.
      </p>

      <Card>
        <CardHeader title={`회원 목록 (${data?.total ?? '…'})`} />
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !data || data.items.length === 0 ? (
          <Empty text="회원이 없습니다" />
        ) : (
          <>
            <Table head={['닉네임', '상태', '멤버십', '출처', '사용/주문', '최근 로그인', '관리']}>
              {data.items.map((u) => (
                <tr key={u.id} className={u.status !== 'ACTIVE' ? 'opacity-60' : ''}>
                  <Td>
                    <div className="font-medium">{u.nickname}</div>
                    <div className="text-xs text-ink-3">{u.email ?? '-'} · {u.provider}</div>
                  </Td>
                  <Td><Badge>{STATUS_LABEL[u.status] ?? u.status}</Badge></Td>
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
                  <Td>
                    <div className="flex gap-1.5">
                      {u.status === 'ACTIVE' ? (
                        <>
                          <Button small variant="ghost" onClick={() => setStatus(u, 'DORMANT')}>정지</Button>
                          <Button small variant="danger" onClick={() => setStatus(u, 'WITHDRAWN')}>탈퇴 처리</Button>
                        </>
                      ) : (
                        <Button small onClick={() => setStatus(u, 'ACTIVE')}>복구</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={data.page} pages={data.pages} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
