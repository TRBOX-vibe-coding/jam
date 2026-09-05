'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

const EMPTY_FORM = { code: '', name: '', description: '', price: '', durationDays: '', sortOrder: '0' };

export default function MembershipPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<any | null>(null);
  const [ef, setEf] = useState(EMPTY_FORM);

  const load = useCallback(() => {
    api<any[]>('/admin/plans').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function create() {
    try {
      await api('/admin/plans', {
        method: 'POST',
        body: {
          code: form.code,
          name: form.name,
          description: form.description || undefined,
          price: Number(form.price),
          durationDays: Number(form.durationDays),
          sortOrder: Number(form.sortOrder) || 0,
        },
      });
      setMsg(`'${form.name}' 플랜 생성 — 앱 멤버십 목록에 바로 노출됩니다`);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function openEdit(p: any) {
    setEf({
      code: p.code, name: p.name, description: p.description ?? '',
      price: String(p.price), durationDays: String(p.durationDays), sortOrder: String(p.sortOrder),
    });
    setEditing(p);
  }

  async function saveEdit() {
    try {
      await api(`/admin/plans/${editing.id}`, {
        method: 'PATCH',
        body: {
          name: ef.name,
          description: ef.description || undefined,
          price: Number(ef.price),
          durationDays: Number(ef.durationDays),
          sortOrder: Number(ef.sortOrder) || 0,
        },
      });
      setMsg(`'${ef.name}' 수정 완료 — 이후 구매부터 적용됩니다`);
      setEditing(null);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function toggle(p: any) {
    await api(`/admin/plans/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
    setMsg(`'${p.name}' → ${p.isActive ? '판매 중지' : '판매 재개'}`);
    load();
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">멤버십 플랜</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '닫기' : '＋ 플랜 만들기'}</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        앱 MY 탭에 노출되는 멤버십 상품입니다. 가격·기간을 바꾸면 <b>이후 구매부터</b> 적용되고,
        이미 가입한 회원의 조건은 바뀌지 않습니다. 판매 중지하면 앱에서 숨겨집니다 (기존 가입자 유지).
      </p>

      {showCreate && (
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <input className={inputCls} placeholder="코드 * (예: TASTE1)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
            <input className={inputCls} placeholder="이름 * (예: 맛보기잼)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={`${inputCls} lg:col-span-2`} placeholder="설명" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className={inputCls} placeholder="가격(원) *" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })} />
            <div className="flex gap-2">
              <input className={inputCls} placeholder="기간(일) *" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value.replace(/\D/g, '') })} />
              <Button onClick={create} disabled={form.code.length < 2 || form.name.length < 2 || !form.price || !form.durationDays}>생성</Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">가격 0원도 가능합니다 (무료 체험용 맛보기잼 등).</p>
        </Card>
      )}

      <Card>
        <CardHeader title={`플랜 목록 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={3} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="플랜이 없습니다" />
        ) : (
          <Table head={['상태', '플랜', '가격', '기간', '누적 가입', '관리']}>
            {rows.map((p) => (
              <tr key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                <Td><Badge>{p.isActive ? 'ACTIVE' : 'CLOSED'}</Badge></Td>
                <Td className="max-w-[280px]">
                  <div className="font-medium">💎 {p.name} <span className="text-xs text-ink-3">({p.code})</span></div>
                  <div className="truncate text-xs text-ink-3">{p.description}</div>
                </Td>
                <Td className="tabular-nums font-semibold">{won(p.price)}</Td>
                <Td className="tabular-nums">{p.durationDays}일</Td>
                <Td className="tabular-nums text-xs text-ink-3">{p._count.memberships}명</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Button small variant="ghost" onClick={() => openEdit(p)}>수정</Button>
                    <Button small variant={p.isActive ? 'danger' : 'primary'} onClick={() => toggle(p)}>
                      {p.isActive ? '판매 중지' : '판매 재개'}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && (
        <Modal title={`플랜 수정 — ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">이름</label>
              <input className={inputCls} value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">설명</label>
              <input className={inputCls} value={ef.description} onChange={(e) => setEf({ ...ef, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">가격(원)</label>
                <input className={inputCls} value={ef.price} onChange={(e) => setEf({ ...ef, price: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">기간(일)</label>
                <input className={inputCls} value={ef.durationDays} onChange={(e) => setEf({ ...ef, durationDays: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">노출 순서</label>
                <input className={inputCls} value={ef.sortOrder} onChange={(e) => setEf({ ...ef, sortOrder: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>취소</Button>
              <Button onClick={saveEdit} disabled={ef.name.length < 2 || !ef.price || !ef.durationDays}>저장</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
