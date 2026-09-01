'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

const TYPE_LABEL: Record<string, string> = { PERCENT: '% 할인', AMOUNT: '금액 할인', FREEBIE: '증정' };

const EMPTY_FORM = {
  merchantId: '', title: '', type: 'PERCENT', value: '', freebieName: '',
  companionLimit: '', maxUsePerUser: '', maxUsePerDay: '', minOrderAmount: '', conditions: '',
};

/** 혜택 내용 한 줄 요약 */
function benefitDesc(b: any) {
  const core = b.type === 'PERCENT' ? `${b.value}% 할인` : b.type === 'AMOUNT' ? `${won(b.value)} 할인` : `${b.freebieName} 증정`;
  const conds: string[] = [];
  if (b.companionLimit) conds.push(`동반 ${b.companionLimit}인`);
  if (b.maxUsePerUser) conds.push(`1인 ${b.maxUsePerUser}회`);
  if (b.maxUsePerDay) conds.push(`하루 ${b.maxUsePerDay}회`);
  if (b.minOrderAmount) conds.push(`${won(b.minOrderAmount)} 이상`);
  return { core, conds: conds.join(' · ') };
}

function approvalBadge(b: any): string {
  if (b.approval === 'PENDING') return 'PENDING';
  if (b.approval === 'REJECTED') return 'REJECTED';
  return b.isActive ? 'ACTIVE' : 'CLOSED';
}

export default function BenefitsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(() => {
    api<any[]>('/admin/benefits').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    load();
    api<any[]>('/admin/merchants?status=ACTIVE').then(setMerchants).catch(() => {});
  }, [load]);

  const pending = (rows ?? []).filter((b) => b.approval === 'PENDING');

  async function approve(b: any) {
    const r = await api<{ grantedMembers: number }>(`/admin/benefits/${b.id}/approve`, { method: 'POST' });
    setMsg(`'${b.title}' 승인 — 유효 멤버십 ${r.grantedMembers}명에게 즉시 지급`);
    load();
  }
  async function reject(b: any) {
    const reason = prompt('반려 사유를 입력하세요 (점주에게 표시됩니다)');
    if (!reason) return;
    await api(`/admin/benefits/${b.id}/reject`, { method: 'POST', body: { reason } });
    setMsg('반려 처리했습니다');
    load();
  }
  async function toggleActive(b: any) {
    await api(`/admin/benefits/${b.id}`, { method: 'PATCH', body: { isActive: !b.isActive } });
    setMsg(`'${b.title}' → ${b.isActive ? '중지' : '재개'}`);
    load();
  }
  async function remove(b: any) {
    if (!confirm(`'${b.title}' 혜택을 삭제할까요?\n이미 지급된 회원이 있으면 중지 처리됩니다.`)) return;
    const r = await api<{ message?: string }>(`/admin/benefits/${b.id}`, { method: 'DELETE' });
    setMsg(r.message ?? '삭제했습니다');
    load();
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing('new');
  }
  function openEdit(b: any) {
    setForm({
      merchantId: b.merchantId, title: b.title, type: b.type,
      value: b.value ? String(b.value) : '', freebieName: b.freebieName ?? '',
      companionLimit: b.companionLimit ? String(b.companionLimit) : '',
      maxUsePerUser: b.maxUsePerUser ? String(b.maxUsePerUser) : '',
      maxUsePerDay: b.maxUsePerDay ? String(b.maxUsePerDay) : '',
      minOrderAmount: b.minOrderAmount ? String(b.minOrderAmount) : '',
      conditions: b.conditions ?? '',
    });
    setEditing(b);
  }
  async function save() {
    try {
      const body: any = {
        title: form.title,
        value: form.value ? Number(form.value) : undefined,
        freebieName: form.type === 'FREEBIE' ? form.freebieName : undefined,
        companionLimit: form.companionLimit ? Number(form.companionLimit) : undefined,
        maxUsePerUser: form.maxUsePerUser ? Number(form.maxUsePerUser) : undefined,
        maxUsePerDay: form.maxUsePerDay ? Number(form.maxUsePerDay) : undefined,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : undefined,
        conditions: form.conditions || undefined,
      };
      if (editing === 'new') {
        const r = await api<{ grantedMembers: number }>('/admin/benefits', {
          method: 'POST',
          body: { ...body, merchantId: form.merchantId, type: form.type },
        });
        setMsg(`혜택 등록 완료 — 유효 멤버십 ${r.grantedMembers}명에게 즉시 지급`);
      } else {
        await api(`/admin/benefits/${(editing as any).id}`, { method: 'PATCH', body });
        setMsg('혜택을 수정했습니다');
      }
      setEditing(null);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';
  const isNew = editing === 'new';
  const formValid =
    form.title.length >= 2 &&
    (!isNew || form.merchantId) &&
    (form.type === 'FREEBIE' ? form.freebieName.length >= 1 : Number(form.value) >= 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">혜택 (멤버십 할인쿠폰)</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={openNew}>＋ 혜택 직접 등록</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        멤버십 회원에게 상시로 열리는 할인·증정입니다. 점주가 앱에서 제출하면 여기서 승인하고,
        승인 즉시 <b>유효한 멤버십 보유자 전원의 혜택함</b>에 자동 지급됩니다.
      </p>

      <Card>
        <CardHeader title={`승인 대기 (${rows === null ? '…' : pending.length})`} />
        {rows === null ? (
          <TableSkeleton rows={2} cols={5} />
        ) : pending.length === 0 ? (
          <Empty text="승인 대기 중인 혜택이 없습니다" />
        ) : (
          <Table head={['가맹점', '혜택', '조건', '처리']}>
            {pending.map((b) => {
              const d = benefitDesc(b);
              return (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap font-medium">{b.merchant.name}</Td>
                  <Td className="max-w-[280px]">
                    <div className="truncate font-medium">{b.title}</div>
                    <div className="text-xs text-ink-3">{TYPE_LABEL[b.type]} · {d.core}</div>
                  </Td>
                  <Td className="max-w-[220px] truncate text-xs text-ink-3">{d.conds || b.conditions || '제한 없음'}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button small onClick={() => approve(b)}>승인</Button>
                      <Button small variant="ghost" onClick={() => openEdit(b)}>수정</Button>
                      <Button small variant="danger" onClick={() => reject(b)}>반려</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title={`전체 혜택 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="등록된 혜택이 없습니다" />
        ) : (
          <Table head={['상태', '가맹점', '혜택', '조건', '지급', '관리']}>
            {rows.map((b) => {
              const d = benefitDesc(b);
              return (
                <tr key={b.id} className={b.approval === 'REJECTED' ? 'opacity-60' : ''}>
                  <Td><Badge>{approvalBadge(b)}</Badge></Td>
                  <Td className="whitespace-nowrap">{b.merchant.name}</Td>
                  <Td className="max-w-[260px]">
                    <div className="truncate font-medium">{b.title}</div>
                    <div className="text-xs text-ink-3">{TYPE_LABEL[b.type]} · {d.core}</div>
                    {b.approval === 'REJECTED' && b.rejectReason && (
                      <div className="text-xs text-bad">반려: {b.rejectReason}</div>
                    )}
                  </Td>
                  <Td className="max-w-[200px] truncate text-xs text-ink-3">{d.conds || b.conditions || '—'}</Td>
                  <Td className="tabular-nums text-xs text-ink-3">{b._count.userBenefits}명</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {b.approval === 'PENDING' ? (
                        <Button small onClick={() => approve(b)}>승인</Button>
                      ) : b.approval === 'ACTIVE' ? (
                        <Button small variant={b.isActive ? 'danger' : 'primary'} onClick={() => toggleActive(b)}>
                          {b.isActive ? '중지' : '재개'}
                        </Button>
                      ) : (
                        <Button small onClick={() => approve(b)}>재승인</Button>
                      )}
                      <Button small variant="ghost" onClick={() => openEdit(b)}>수정</Button>
                      <Button small variant="danger" onClick={() => remove(b)}>삭제</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {editing && (
        <Modal title={isNew ? '혜택 직접 등록' : `혜택 수정 — ${(editing as any).title}`} onClose={() => setEditing(null)} wide>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isNew && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">가맹점 *</label>
                <select className={inputCls} value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })}>
                  <option value="">선택</option>
                  {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            {isNew && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">방식 *</label>
                <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="PERCENT">% 할인</option>
                  <option value="AMOUNT">금액 할인</option>
                  <option value="FREEBIE">증정</option>
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">혜택 이름 *</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예) 전 메뉴 20% 할인" />
            </div>
            {form.type === 'FREEBIE' ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">증정품 이름 *</label>
                <input className={inputCls} value={form.freebieName} onChange={(e) => setForm({ ...form, freebieName: e.target.value })} placeholder="예) 아메리카노" />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-3">{form.type === 'PERCENT' ? '할인율(%) *' : '할인 금액(원) *'}</label>
                <input className={inputCls} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/\D/g, '') })} placeholder={form.type === 'PERCENT' ? '20' : '3000'} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">동반 인원까지</label>
              <input className={inputCls} value={form.companionLimit} onChange={(e) => setForm({ ...form, companionLimit: e.target.value.replace(/\D/g, '') })} placeholder="비우면 제한 없음" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">1인당 총 횟수</label>
              <input className={inputCls} value={form.maxUsePerUser} onChange={(e) => setForm({ ...form, maxUsePerUser: e.target.value.replace(/\D/g, '') })} placeholder="비우면 제한 없음" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">하루 최대 횟수</label>
              <input className={inputCls} value={form.maxUsePerDay} onChange={(e) => setForm({ ...form, maxUsePerDay: e.target.value.replace(/\D/g, '') })} placeholder="비우면 제한 없음" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">최소 주문금액</label>
              <input className={inputCls} value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value.replace(/\D/g, '') })} placeholder="비우면 제한 없음" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">기타 조건 메모</label>
              <input className={inputCls} value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} placeholder="예) 주말 공휴일 제외" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>취소</Button>
            <Button onClick={save} disabled={!formValid}>{isNew ? '등록 + 즉시 지급' : '저장'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
