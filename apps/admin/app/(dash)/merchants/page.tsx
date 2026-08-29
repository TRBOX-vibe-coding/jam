'use client';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

type Opt = { id: string; name: string; emoji?: string };

const EMPTY_FORM = { name: '', regionId: '', categoryId: '', address: '', ownerName: '', contactPhone: '', contactEmail: '', intro: '', commissionRate: '0' };

export default function MerchantsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [regions, setRegions] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [qrPreview, setQrPreview] = useState<{ name: string; code: string; dataUrl: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(() => {
    api<any[]>('/admin/merchants').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    load();
    api<Opt[]>('/regions').then(setRegions).catch(() => {});
    api<Opt[]>('/categories').then(setCategories).catch(() => {});
  }, [load]);

  async function issueQr(id: string, name: string) {
    const qr = await api<{ code: string }>(`/admin/merchants/${id}/qr`, { method: 'POST', body: { label: '카운터' } });
    setMsg(`${name} QR 발급 완료`);
    await showQr(name, qr.code);
    load();
  }

  async function showQr(name: string, code: string) {
    const dataUrl = await QRCode.toDataURL(code, { width: 480, margin: 2 });
    setQrPreview({ name, code, dataUrl });
  }

  async function approve(m: any) {
    await api(`/admin/merchants/${m.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } });
    setMsg(`${m.name} 입점 승인 완료`);
    load();
  }

  async function toggleStatus(m: any) {
    const next = m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api(`/admin/merchants/${m.id}`, { method: 'PATCH', body: { status: next } });
    setMsg(`${m.name} → ${next === 'ACTIVE' ? '운영 재개' : '일시 중지'}`);
    load();
  }

  async function remove(m: any) {
    if (!confirm(`'${m.name}' 가맹점을 삭제할까요?\n거래 이력이 있으면 폐점 처리로 전환됩니다.`)) return;
    const r = await api<{ message?: string }>(`/admin/merchants/${m.id}`, { method: 'DELETE' });
    setMsg(r.message ?? `${m.name} 삭제 완료`);
    load();
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing('new');
  }
  function openEdit(m: any) {
    setForm({
      name: m.name, regionId: m.regionId ?? m.region?.id ?? '', categoryId: m.categoryId ?? m.category?.id ?? '',
      address: m.address ?? '', ownerName: m.ownerName ?? '', contactPhone: m.contactPhone ?? '',
      contactEmail: m.contactEmail ?? '', intro: m.intro ?? '', commissionRate: String(Number(m.commissionRate ?? 0)),
    });
    setEditing(m);
  }
  async function save() {
    try {
      const body: any = {
        name: form.name, address: form.address || undefined, ownerName: form.ownerName || undefined,
        contactPhone: form.contactPhone || undefined, contactEmail: form.contactEmail || undefined,
        intro: form.intro || undefined, commissionRate: Number(form.commissionRate) || 0,
      };
      if (editing === 'new') {
        await api('/admin/merchants', {
          method: 'POST',
          body: { ...body, regionId: form.regionId, categoryId: form.categoryId },
        });
        setMsg('가맹점을 등록했습니다 (본사 발굴 입점)');
      } else {
        await api(`/admin/merchants/${(editing as any).id}`, {
          method: 'PATCH',
          body: { ...body, regionId: form.regionId || undefined, categoryId: form.categoryId || undefined },
        });
        setMsg('가맹점 정보를 수정했습니다');
      }
      setEditing(null);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">가맹점</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={openNew}>＋ 가맹점 직접 등록</Button>
        </div>
      </div>

      <Card>
        <CardHeader title={`전체 가맹점 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={7} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="가맹점이 없습니다" />
        ) : (
          <Table head={['상태', '가맹점', '지역/카테고리', '수수료율', '사용/DROP', '매장 QR', '관리']}>
            {rows.map((m) => (
              <tr key={m.id}>
                <Td><Badge>{m.status}</Badge></Td>
                <Td>
                  <div className="font-medium">{m.name}</div>
                  {(m.ownerName || m.bizRegNo) && (
                    <div className="max-w-[260px] text-[11px] text-ink-3">
                      대표 {m.ownerName ?? '-'} · 사업자 {m.bizRegNo ?? '-'}
                      {m.contactPhone && <> · {m.contactPhone}</>}
                      {m.contactEmail && <> · {m.contactEmail}</>}
                      {m.address && <div className="truncate">{m.address}</div>}
                    </div>
                  )}
                  <div className="max-w-[200px] truncate text-xs text-ink-3">{m.intro}</div>
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {m.region.name} · {m.category.emoji} {m.category.name}
                </Td>
                <Td className="tabular-nums">{Number(m.commissionRate)}%</Td>
                <Td className="tabular-nums text-xs text-ink-3">
                  사용 {m._count.redemptions} · DROP {m._count.drops}
                </Td>
                <Td>
                  {m.qrCodes.length > 0 ? (
                    <button
                      onClick={() => showQr(m.name, m.qrCodes[0].code)}
                      className="text-xs font-semibold text-brand underline underline-offset-2"
                    >
                      QR 보기
                    </button>
                  ) : (
                    <span className="text-xs text-ink-3">미발급</span>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    {m.status === 'PENDING' ? (
                      <Button small onClick={() => approve(m)}>입점 승인</Button>
                    ) : (
                      <>
                        <Button small variant="ghost" onClick={() => issueQr(m.id, m.name)}>QR 발급</Button>
                        <Button small variant={m.status === 'ACTIVE' ? 'danger' : 'primary'} onClick={() => toggleStatus(m)}>
                          {m.status === 'ACTIVE' ? '중지' : '재개'}
                        </Button>
                      </>
                    )}
                    <Button small variant="ghost" onClick={() => openEdit(m)}>수정</Button>
                    <Button small variant="danger" onClick={() => remove(m)}>삭제</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && (
        <Modal title={editing === 'new' ? '가맹점 직접 등록' : `가맹점 수정 — ${(editing as any).name}`} onClose={() => setEditing(null)} wide>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">가게 이름 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">수수료율(%)</label>
              <input className={inputCls} value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value.replace(/[^\d.]/g, '') })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">지역 *</label>
              <select className={inputCls} value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })}>
                <option value="">선택</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">업종 *</label>
              <select className={inputCls} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">선택</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">주소</label>
              <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">대표 이름</label>
              <input className={inputCls} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">연락처</label>
              <input className={inputCls} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">이메일</label>
              <input className={inputCls} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">한 줄 소개</label>
              <input className={inputCls} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>취소</Button>
            <Button onClick={save} disabled={form.name.length < 2 || (editing === 'new' && (!form.regionId || !form.categoryId))}>
              {editing === 'new' ? '등록' : '저장'}
            </Button>
          </div>
        </Modal>
      )}

      {qrPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setQrPreview(null)}
        >
          <div className="w-full max-w-xs rounded-xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold">{qrPreview.name}</div>
            <div className="mb-3 text-[11px] text-ink-3">매장 카운터 비치용 고정 QR</div>
            <img src={qrPreview.dataUrl} alt="매장 QR" className="mx-auto w-56" />
            <div className="mt-2 break-all font-mono text-[10px] text-ink-3">{qrPreview.code}</div>
            <div className="mt-4 flex justify-center gap-2">
              <Button small variant="ghost" onClick={() => window.print()}>인쇄</Button>
              <Button small onClick={() => setQrPreview(null)}>닫기</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
