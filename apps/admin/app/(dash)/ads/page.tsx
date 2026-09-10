'use client';
/**
 * 광고 — 카테고리별 쿠폰/상품 1~10순위 지정 + 기간 설정 (2026-09-10 픽스).
 * 기간 안에만 앱 목록 상단에 고정되고, 지나면 자동으로 내려간다. 수금은 월 정액(오프라인).
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, TableSkeleton } from '@/components/ui';

type Opt = { id: string; label: string };
type Slot = {
  id: string; itemType: 'BENEFIT' | 'PRODUCT'; refId: string; rank: number;
  startAt: string; endAt: string; label: string; live: boolean;
};

const d10 = (s: string) => s.slice(0, 10);

export default function AdsPage() {
  const [cats, setCats] = useState<{ id: string; name: string; emoji: string | null }[]>([]);
  const [catId, setCatId] = useState('');
  const [data, setData] = useState<{ slots: Slot[]; benefits: Opt[]; products: Opt[] } | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<any[]>('/admin/categories').then((r) => {
      setCats(r);
      if (r[0]) setCatId(r[0].id);
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!catId) return;
    setData(null);
    api<any>(`/admin/ads/${catId}`).then(setData).catch(() => setData({ slots: [], benefits: [], products: [] }));
  }, [catId]);
  useEffect(load, [load]);

  async function save(itemType: 'BENEFIT' | 'PRODUCT', rank: number, refId: string, startAt: string, endAt: string) {
    if (!refId || !startAt || !endAt) { alert('항목과 기간을 모두 선택해 주세요'); return; }
    try {
      const r = await api<{ message: string }>('/admin/ads', {
        method: 'POST',
        body: { categoryId: catId, itemType, refId, rank, startAt: `${startAt}T00:00:00`, endAt: `${endAt}T23:59:59` },
      });
      setMsg(r.message);
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function remove(id: string) {
    await api(`/admin/ads/${id}`, { method: 'DELETE' }).catch(() => {});
    setMsg('광고 자리를 비웠습니다');
    load();
  }

  function SlotTable({ itemType, options }: { itemType: 'BENEFIT' | 'PRODUCT'; options: Opt[] }) {
    const [draft, setDraft] = useState<Record<number, { refId: string; startAt: string; endAt: string }>>({});
    const slots = data!.slots.filter((s) => s.itemType === itemType);
    const selCls = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs outline-none focus:border-brand';
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="text-left text-xs text-ink-3">
            <th className="px-3 py-2">순위</th><th className="px-3 py-2">항목</th>
            <th className="px-3 py-2">시작</th><th className="px-3 py-2">종료</th>
            <th className="px-3 py-2">상태</th><th className="px-3 py-2">관리</th>
          </tr></thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => {
              const rank = i + 1;
              const slot = slots.find((s) => s.rank === rank);
              const dr = draft[rank] ?? { refId: slot?.refId ?? '', startAt: slot ? d10(slot.startAt) : '', endAt: slot ? d10(slot.endAt) : '' };
              const set = (patch: Partial<typeof dr>) => setDraft((p) => ({ ...p, [rank]: { ...dr, ...patch } }));
              return (
                <tr key={rank} className="border-t border-line">
                  <td className="px-3 py-2 font-bold text-brand">{rank}위</td>
                  <td className="px-3 py-2" style={{ minWidth: 240 }}>
                    <select className={selCls} value={dr.refId} onChange={(e) => set({ refId: e.target.value })}>
                      <option value="">— 비워둠 —</option>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input type="date" className={selCls} value={dr.startAt} onChange={(e) => set({ startAt: e.target.value })} /></td>
                  <td className="px-3 py-2"><input type="date" className={selCls} value={dr.endAt} onChange={(e) => set({ endAt: e.target.value })} /></td>
                  <td className="px-3 py-2">
                    {slot ? (slot.live ? <Badge>노출 중</Badge> : <span className="text-xs text-ink-3">기간 아님</span>) : <span className="text-xs text-ink-3">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <Button small onClick={() => save(itemType, rank, dr.refId, dr.startAt, dr.endAt)}>저장</Button>
                      {slot && <Button small variant="danger" onClick={() => remove(slot.id)}>비우기</Button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">광고 (상위 노출)</h1>
        {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
      </div>
      <p className="max-w-2xl text-xs leading-5 text-ink-3">
        카테고리별로 쿠폰·상품에 <b>1~10순위</b>를 기간과 함께 지정합니다. 기간 안에만 앱 목록 상단에 고정되고
        기간이 지나면 자동으로 내려갑니다. 광고비는 월 정액으로 별도 수금합니다 (PG 정산과 무관).
      </p>

      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => setCatId(c.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${catId === c.id ? 'bg-brand text-white' : 'border border-line bg-white text-ink-2'}`}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      {!data ? (
        <Card><TableSkeleton rows={5} cols={6} /></Card>
      ) : (
        <>
          <Card>
            <CardHeader title="🎟️ 할인 쿠폰 광고 자리" />
            {data.benefits.length === 0 ? <Empty text="이 카테고리에 활성 쿠폰이 없습니다" /> : <SlotTable itemType="BENEFIT" options={data.benefits} />}
          </Card>
          <Card>
            <CardHeader title="🎫 상품(예약·결제) 광고 자리" />
            {data.products.length === 0 ? <Empty text="이 카테고리에 활성 상품이 없습니다" /> : <SlotTable itemType="PRODUCT" options={data.products} />}
          </Card>
        </>
      )}
    </div>
  );
}
