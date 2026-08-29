'use client';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api, dt, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

/** 점주 업로드 사진(/uploads/..)은 API 서버 주소를 붙이고, 표시 크기에 맞는 폭으로 요청한다 */
const img = (u?: string | null, w = 160) => (u ? (u.startsWith('/') ? `${API_BASE}${u}?w=${w}` : u) : null);

function Thumb({ src }: { src?: string | null }) {
  const s = img(src);
  return s ? (
    <img src={s} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded object-cover" />
  ) : (
    <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-ground text-[10px] text-ink-3">사진없음</div>
  );
}

export default function DropsPage() {
  const [pending, setPending] = useState<any[] | null>(null);
  const [all, setAll] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({ title: '', description: '', normalPrice: '', dropPrice: '', totalQty: '' });

  const load = useCallback(() => {
    api<any[]>('/admin/drops?status=PENDING').then(setPending).catch(() => setPending([]));
    api<any[]>('/admin/drops').then(setAll).catch(() => setAll([]));
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
  async function revert(d: any) {
    if (!confirm(`'${d.title}'을(를) 승인 대기 상태로 되돌릴까요? 오픈 중이면 판매가 중단됩니다.`)) return;
    await api(`/admin/drops/${d.id}`, { method: 'PATCH', body: { status: 'PENDING' } });
    setMsg('승인 대기로 되돌렸습니다');
    load();
  }
  async function remove(d: any) {
    if (!confirm(`'${d.title}'을(를) 삭제할까요? 수령 이력이 있으면 취소 처리됩니다.`)) return;
    const r = await api<{ mode: string; message?: string }>(`/admin/drops/${d.id}`, { method: 'DELETE' });
    setMsg(r.message ?? '삭제했습니다');
    load();
  }
  function openEdit(d: any) {
    setEdit(d);
    setForm({
      title: d.title, description: d.description ?? '',
      normalPrice: String(d.normalPrice), dropPrice: String(d.dropPrice), totalQty: String(d.totalQty),
    });
  }
  async function saveEdit() {
    try {
      await api(`/admin/drops/${edit.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          description: form.description || undefined,
          normalPrice: Number(form.normalPrice),
          dropPrice: Number(form.dropPrice),
          totalQty: Number(form.totalQty),
        },
      });
      setMsg('딜을 수정했습니다');
      setEdit(null);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">DROP 관리</h1>
        {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
      </div>

      <Card>
        <CardHeader title={`승인 대기 (${pending?.length ?? '…'})`} />
        {pending === null ? (
          <TableSkeleton rows={2} cols={5} />
        ) : pending.length === 0 ? (
          <Empty text="승인 대기 중인 DROP이 없습니다" />
        ) : (
          <Table head={['가맹점', '제목', '가격', '수량', '기간', '처리']}>
            {pending.map((d) => (
              <tr key={d.id}>
                <Td className="whitespace-nowrap font-medium">{d.merchant.name}</Td>
                <Td className="max-w-[300px]">
                  <div className="flex items-center gap-2.5">
                    <Thumb src={d.imageUrl} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{d.title}</div>
                      <div className="truncate text-xs text-ink-3">{d.description}</div>
                    </div>
                  </div>
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
                    <Button small variant="ghost" onClick={() => openEdit(d)}>수정</Button>
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
        {all === null ? (
          <TableSkeleton rows={6} cols={6} />
        ) : all.length === 0 ? (
          <Empty text="딜이 없습니다" />
        ) : (
          <Table head={['상태', '가맹점', '제목', '가격', '남은/전체', '마감', '관리']}>
            {all.map((d) => (
              <tr key={d.id}>
                <Td><Badge>{d.status}</Badge></Td>
                <Td className="whitespace-nowrap">{d.merchant.name}</Td>
                <Td className="max-w-[280px]">
                  <div className="flex items-center gap-2.5">
                    <Thumb src={d.imageUrl} />
                    <span className="truncate font-medium">{d.title}</span>
                  </div>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {won(d.dropPrice)}{' '}
                  <span className="text-xs text-ink-3">({Math.round((1 - d.dropPrice / d.normalPrice) * 100)}%↓)</span>
                </Td>
                <Td className="tabular-nums">{d.remainingQty}/{d.totalQty}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">{dt(d.closeAt)}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Button small variant="ghost" onClick={() => openEdit(d)}>수정</Button>
                    {['OPEN', 'SCHEDULED', 'REJECTED', 'CLOSED', 'SOLD_OUT'].includes(d.status) && (
                      <Button small variant="ghost" onClick={() => revert(d)}>대기로</Button>
                    )}
                    <Button small variant="danger" onClick={() => remove(d)}>삭제</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {edit && (
        <Modal title={`딜 수정 — ${edit.merchant?.name ?? ''}`} onClose={() => setEdit(null)}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">제목</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">설명</label>
              <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">정상가</label>
                <input className={inputCls} value={form.normalPrice} onChange={(e) => setForm({ ...form, normalPrice: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">딜 가격</label>
                <input className={inputCls} value={form.dropPrice} onChange={(e) => setForm({ ...form, dropPrice: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">총 수량</label>
                <input className={inputCls} value={form.totalQty} onChange={(e) => setForm({ ...form, totalQty: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>취소</Button>
              <Button onClick={saveEdit}>저장</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
