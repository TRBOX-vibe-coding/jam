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
  const [tab, setTab] = useState<'benefits' | 'coupons'>('benefits');
  const [rows, setRows] = useState<any[] | null>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // 타임 쿠폰 드롭
  const [cdRows, setCdRows] = useState<any[] | null>(null);
  const [cdForm, setCdForm] = useState({ benefitId: '', times: '09:00, 17:00', qtyPerSlot: '30', validHours: '24' });

  const load = useCallback(() => {
    api<any[]>('/admin/benefits').then(setRows).catch(() => setRows([]));
    api<any[]>('/admin/coupon-drops').then(setCdRows).catch(() => setCdRows([]));
  }, []);
  useEffect(() => {
    load();
    api<any[]>('/admin/merchants?status=ACTIVE').then(setMerchants).catch(() => {});
  }, [load]);

  async function createCouponDrop() {
    try {
      const times = cdForm.times.split(',').map((t) => t.trim()).filter(Boolean);
      await api('/admin/coupon-drops', {
        method: 'POST',
        body: {
          benefitId: cdForm.benefitId,
          times,
          qtyPerSlot: Number(cdForm.qtyPerSlot) || 30,
          validHours: Number(cdForm.validHours) || 24,
        },
      });
      setMsg('타임 쿠폰 배포를 등록했습니다');
      setCdForm({ benefitId: '', times: '09:00, 17:00', qtyPerSlot: '30', validHours: '24' });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }
  async function toggleCouponDrop(d: any) {
    await api(`/admin/coupon-drops/${d.id}`, { method: 'PATCH', body: { isActive: !d.isActive } });
    setMsg(`'${d.benefit.title}' 배포 → ${d.isActive ? '중지' : '재개'}`);
    load();
  }
  async function removeCouponDrop(d: any) {
    if (!confirm(`'${d.benefit.title}' 타임 배포를 삭제할까요? (이미 지급된 쿠폰은 유지됩니다)`)) return;
    await api(`/admin/coupon-drops/${d.id}`, { method: 'DELETE' });
    setMsg('배포를 삭제했습니다');
    load();
  }

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

      {/* 탭 */}
      <div className="flex gap-1 border-b border-line">
        {([['benefits', '혜택 관리'], ['coupons', '⏰ 타임 쿠폰 배포']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === key ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'coupons' && (
        <>
          <p className="text-xs text-ink-3">
            정해진 시각(예: 09:00·17:00)마다 <b>무료 회원에게 선착순 쿠폰</b>을 뿌립니다.
            멤버십 회원은 이미 전 혜택이 상시 오픈이라 대상이 아니며, 무료 회원의 앱 홈에 카운트다운과 [받기] 버튼이 표시됩니다.
          </p>
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <select className={inputCls + ' lg:col-span-2'} value={cdForm.benefitId} onChange={(e) => setCdForm({ ...cdForm, benefitId: e.target.value })}>
                <option value="">배포할 혜택 선택</option>
                {(rows ?? []).filter((b) => b.approval === 'ACTIVE' && b.isActive).map((b) => (
                  <option key={b.id} value={b.id}>{b.merchant.name} — {b.title}</option>
                ))}
              </select>
              <input className={inputCls} placeholder="배포 시각 (09:00, 17:00)" value={cdForm.times} onChange={(e) => setCdForm({ ...cdForm, times: e.target.value })} />
              <input className={inputCls} placeholder="회차당 수량" value={cdForm.qtyPerSlot} onChange={(e) => setCdForm({ ...cdForm, qtyPerSlot: e.target.value.replace(/\D/g, '') })} />
              <div className="flex gap-2">
                <input className={inputCls} placeholder="유효(시간)" value={cdForm.validHours} onChange={(e) => setCdForm({ ...cdForm, validHours: e.target.value.replace(/\D/g, '') })} />
                <Button onClick={createCouponDrop} disabled={!cdForm.benefitId || !cdForm.times.trim()}>등록</Button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-3">배포 시각은 쉼표로 여러 개 지정할 수 있습니다. 각 회차는 시작 후 60분 동안(또는 소진 시까지) 받을 수 있습니다.</p>
          </Card>
          <Card>
            <CardHeader title={`배포 목록 (${cdRows?.length ?? '…'})`} />
            {cdRows === null ? (
              <TableSkeleton rows={3} cols={6} />
            ) : cdRows.length === 0 ? (
              <Empty text="등록된 타임 배포가 없습니다. 위에서 혜택을 골라 등록해 보세요." />
            ) : (
              <Table head={['상태', '혜택', '배포 시각', '회차당 수량', '유효', '오늘/누적 수령', '관리']}>
                {cdRows.map((d) => (
                  <tr key={d.id} className={d.isActive ? '' : 'opacity-60'}>
                    <Td><Badge>{d.isActive ? 'ACTIVE' : 'CLOSED'}</Badge></Td>
                    <Td className="max-w-[260px]">
                      <div className="truncate font-medium">{d.benefit.title}</div>
                      <div className="text-xs text-ink-3">{d.benefit.merchant.name}</div>
                    </Td>
                    <Td className="whitespace-nowrap font-medium text-brand">{d.times.join(' · ')}</Td>
                    <Td className="tabular-nums">{d.qtyPerSlot}장</Td>
                    <Td className="tabular-nums">{d.validHours}시간</Td>
                    <Td className="tabular-nums text-xs text-ink-3">{d.todayClaims} / {d._count.claims}장</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button small variant={d.isActive ? 'danger' : 'primary'} onClick={() => toggleCouponDrop(d)}>
                          {d.isActive ? '중지' : '재개'}
                        </Button>
                        <Button small variant="danger" onClick={() => removeCouponDrop(d)}>삭제</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'benefits' && (
      <>
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

      </>
      )}

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
