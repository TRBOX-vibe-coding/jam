'use client';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api, getToken, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

const EMPTY_FORM = { title: '', subtitle: '', bannerImageUrl: '', subsidyLabel: '', sortOrder: '0', endAt: '' };
const EMPTY_PRODUCT = {
  merchantId: '', name: '', description: '', normalPrice: '', salePrice: '',
  totalQty: '', onePerUser: true, maxPerUser: '2', closeAt: '', imageUrl: '',
};

function dt(s?: string | null) {
  return s ? new Date(s).toLocaleDateString('ko-KR') : '상시';
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [productFor, setProductFor] = useState<any | null>(null);
  const [pf, setPf] = useState(EMPTY_PRODUCT);

  const load = useCallback(() => {
    api<any[]>('/admin/campaigns').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    load();
    api<any[]>('/admin/merchants?status=ACTIVE').then(setMerchants).catch(() => {});
  }, [load]);

  async function create() {
    try {
      await api('/admin/campaigns', {
        method: 'POST',
        body: {
          title: form.title,
          subtitle: form.subtitle || undefined,
          bannerImageUrl: form.bannerImageUrl || undefined,
          subsidyLabel: form.subsidyLabel || undefined,
          sortOrder: Number(form.sortOrder) || 0,
          endAt: form.endAt ? new Date(`${form.endAt}T23:59:59`).toISOString() : undefined,
        },
      });
      setMsg('기획전을 만들었습니다 — 앱 홈 배너에 바로 노출됩니다');
      setForm(EMPTY_FORM);
      setShowCreate(false);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function toggle(c: any) {
    await api(`/admin/campaigns/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } });
    setMsg(`'${c.title}' → ${c.isActive ? '중지 (배너 내림)' : '재개 (배너 노출)'}`);
    load();
  }

  async function remove(c: any) {
    if (!confirm(`'${c.title}' 기획전을 삭제할까요?\n판매 이력이 있으면 종료 처리됩니다.`)) return;
    const r = await api<{ message?: string }>(`/admin/campaigns/${c.id}`, { method: 'DELETE' });
    setMsg(r.message ?? '삭제했습니다');
    load();
  }

  /** 지자체 제출용 판매실적 엑셀 다운로드 */
  async function downloadReport(c: any) {
    const res = await fetch(`${API_BASE}/admin/campaigns/${c.id}/report`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) { alert('다운로드에 실패했습니다'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${c.title}_판매실적_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(`'${c.title}' 판매실적 엑셀을 내려받았습니다`);
  }

  async function addProduct() {
    try {
      await api(`/admin/campaigns/${productFor.id}/products`, {
        method: 'POST',
        body: {
          merchantId: pf.merchantId,
          name: pf.name,
          description: pf.description || undefined,
          normalPrice: Number(pf.normalPrice),
          salePrice: Number(pf.salePrice),
          totalQty: Number(pf.totalQty),
          onePerUser: pf.onePerUser,
          maxPerUser: pf.onePerUser ? undefined : Number(pf.maxPerUser) || 2,
          closeAt: new Date(`${pf.closeAt}T23:59:59`).toISOString(),
          imageUrl: pf.imageUrl || undefined,
        },
      });
      setMsg(`'${pf.name}' 등록 완료 — 앱에서 바로 판매 시작`);
      setProductFor(null);
      setPf(EMPTY_PRODUCT);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">기획전 · 공공사업</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '닫기' : '＋ 기획전 만들기'}</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        키마위크·밀락수변영화관 같은 <b>기간 한정 사업</b>을 관리합니다. 만들면 앱 홈에 배너로 노출되고,
        지자체 상품은 <b>여기(관리자)에서만 등록</b>할 수 있습니다 — 점주 앱에서는 등록되지 않습니다.
        판매실적은 [실적 엑셀]로 내려받아 지자체에 제출하세요 (취소 건은 상태로 구분됩니다).
      </p>

      {showCreate && (
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input className={inputCls} placeholder="기획전 이름 * (예: 키마위크 2026)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className={`${inputCls} lg:col-span-2`} placeholder="부제 (예: 부산 바다 액티비티 페스티벌)" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            <input className={inputCls} placeholder="지원 표기 (예: 부산시 지원)" value={form.subsidyLabel} onChange={(e) => setForm({ ...form, subsidyLabel: e.target.value })} />
            <input className={inputCls} placeholder="배너 이미지 URL" value={form.bannerImageUrl} onChange={(e) => setForm({ ...form, bannerImageUrl: e.target.value })} />
            <div className="flex gap-2">
              <input className={inputCls} type="date" title="종료일" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
              <input className={`${inputCls} w-20`} placeholder="순서" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/\D/g, '') })} />
              <Button onClick={create} disabled={form.title.length < 2}>만들기</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={`기획전 목록 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={3} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="기획전이 없습니다. 위 [＋ 기획전 만들기]로 시작하세요." />
        ) : (
          <Table head={['상태', '기획전', '지원 표기', '기간', '상품', '판매', '관리']}>
            {rows.map((c) => (
              <tr key={c.id} className={c.isActive ? '' : 'opacity-60'}>
                <Td><Badge>{c.isActive ? 'OPEN' : 'CLOSED'}</Badge></Td>
                <Td className="max-w-[280px]">
                  <div className="flex items-center gap-2.5">
                    {c.bannerImageUrl ? (
                      <img src={c.bannerImageUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-ground text-[10px] text-ink-3">배너없음</div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.title}</div>
                      <div className="truncate text-xs text-ink-3">{c.subtitle}</div>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {c.subsidyLabel ? <Badge>{c.subsidyLabel}</Badge> : <span className="text-ink-3">—</span>}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">~{dt(c.endAt)}</Td>
                <Td className="tabular-nums text-xs">{c.productCount}개</Td>
                <Td className="tabular-nums text-xs">
                  <div>{c.soldQty}장</div>
                  <div className="text-ink-3">{won(c.soldAmount)}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    <Button small onClick={() => { setProductFor(c); setPf({ ...EMPTY_PRODUCT, closeAt: c.endAt ? String(c.endAt).slice(0, 10) : '' }); }}>상품 등록</Button>
                    <Button small variant="ghost" onClick={() => downloadReport(c)}>실적 엑셀</Button>
                    <Button small variant={c.isActive ? 'danger' : 'primary'} onClick={() => toggle(c)}>
                      {c.isActive ? '중지' : '재개'}
                    </Button>
                    <Button small variant="danger" onClick={() => remove(c)}>삭제</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {productFor && (
        <Modal title={`지자체 상품 등록 — ${productFor.title}`} onClose={() => setProductFor(null)} wide>
          <p className="mb-3 rounded bg-brand-soft px-3 py-2 text-xs text-brand">
            관리자 전용 등록입니다. 등록 즉시 판매가 시작되고, 총수량이 다 팔리면 자동 품절됩니다.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">제공 가맹점 *</label>
              <select className={inputCls} value={pf.merchantId} onChange={(e) => setPf({ ...pf, merchantId: e.target.value })}>
                <option value="">선택</option>
                {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">상품명 *</label>
              <input className={inputCls} value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} placeholder="예) 비치런+서핑 체험" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">설명</label>
              <input className={inputCls} value={pf.description} onChange={(e) => setPf({ ...pf, description: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">정가(원) *</label>
              <input className={inputCls} value={pf.normalPrice} onChange={(e) => setPf({ ...pf, normalPrice: e.target.value.replace(/\D/g, '') })} placeholder="50000" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">판매가(원) * — 지원 할인 적용가</label>
              <input className={inputCls} value={pf.salePrice} onChange={(e) => setPf({ ...pf, salePrice: e.target.value.replace(/\D/g, '') })} placeholder="25000" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">총 판매수량 * — 다 팔리면 자동 품절</label>
              <input className={inputCls} value={pf.totalQty} onChange={(e) => setPf({ ...pf, totalQty: e.target.value.replace(/\D/g, '') })} placeholder="100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">판매 마감일 *</label>
              <input className={inputCls} type="date" value={pf.closeAt} onChange={(e) => setPf({ ...pf, closeAt: e.target.value })} />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4 rounded-md bg-ground px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={pf.onePerUser} onChange={(e) => setPf({ ...pf, onePerUser: e.target.checked })} />
                1인 1장 제한 (지자체 사업 기본)
              </label>
              {!pf.onePerUser && (
                <label className="flex items-center gap-2 text-sm">
                  1인당 최대
                  <input className="w-16 rounded-md border border-line px-2 py-1 text-sm" value={pf.maxPerUser} onChange={(e) => setPf({ ...pf, maxPerUser: e.target.value.replace(/\D/g, '') })} />
                  장
                </label>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">상품 사진 URL</label>
              <input className={inputCls} value={pf.imageUrl} onChange={(e) => setPf({ ...pf, imageUrl: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setProductFor(null)}>취소</Button>
            <Button onClick={addProduct} disabled={!pf.merchantId || pf.name.length < 2 || !pf.normalPrice || !pf.salePrice || !pf.totalQty || !pf.closeAt}>
              등록 + 판매 시작
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
