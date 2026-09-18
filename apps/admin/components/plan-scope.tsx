'use client';
/**
 * 잼이 여는 쿠폰 설정 — 2026-09-18 대표 확정.
 *
 * 잼이 수십 개가 되므로(기관별 단체 잼까지) 쿠폰을 잼마다 손으로 담지 않는다.
 * 잼에 성격을 하나 주고, 성격과 다른 것만 예외로 더하거나 뺀다.
 *   전부 / 조건으로 고르기(지역·종류) / 직접 고르기
 * 성격을 바꾸면 체크가 그 성격대로 새로 맞춰지고, 거기서 몇 개만 손대면 된다.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Empty, Modal } from '@/components/ui';

const inputCls =
  'h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand';

const SCOPES: [string, string, string][] = [
  ['ALL', '전부', '모든 쿠폰이 열린다 — 잼마스터'],
  ['FILTER', '조건으로 고르기', '지역과 종류를 함께 걸 수 있다 — 다낭잼, 부산 카페잼'],
  ['MANUAL', '직접 고르기', '아래에서 체크한 쿠폰만 — 기획 잼'],
];

function valueText(b: { type: string; value: number; freebieName?: string | null }) {
  if (b.type === 'PERCENT') return `${b.value}%`;
  if (b.type === 'AMOUNT') return `${b.value.toLocaleString()}원`;
  if (b.type === 'AMOUNT_PER_PERSON') return `1인당 ${b.value.toLocaleString()}원`;
  return b.freebieName ?? '증정';
}

export function PlanScopeModal({
  plan,
  onClose,
}: {
  plan: { id: string; name: string };
  onClose: (saved?: boolean) => void;
}) {
  const [benefits, setBenefits] = useState<any[] | null>(null);
  const [regions, setRegions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [scope, setScope] = useState('ALL');
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [orgCode, setOrgCode] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<any>(`/admin/plans/${plan.id}/benefits`)
      .then((r) => {
        setBenefits(r.benefits);
        setScope(['REGION', 'CATEGORY'].includes(r.plan.scope) ? 'FILTER' : r.plan.scope ?? 'ALL');
        setRegionIds(r.plan.scopeRegionIds ?? []);
        setCategoryIds(r.plan.scopeCategoryIds ?? []);
        setIsPrivate(!!r.plan.isPrivate);
        setOrgCode(r.plan.orgCode ?? '');
        setPicked(new Set(r.benefits.filter((b: any) => b.included).map((b: any) => b.id)));
      })
      .catch((e) => setMsg(e.message));
    api<any[]>('/admin/regions').then(setRegions).catch(() => {});
    api<any[]>('/admin/categories').then(setCategories).catch(() => {});
  }, [plan.id]);

  /** 성격을 바꾸면 체크를 그 성격대로 새로 맞춘다 */
  function applyScope(nextScope: string, nextRegions: string[], nextCategories: string[]) {
    if (!benefits) return;
    const next = new Set<string>();
    for (const b of benefits) {
      const covered = nextScope === 'ALL'
        ? true
        : nextScope === 'MANUAL'
        ? false
        : (nextRegions.length === 0 || nextRegions.includes(b.merchant.regionId)) &&
          (nextCategories.length === 0 || nextCategories.includes(b.merchant.categoryId));
      if (covered) next.add(b.id);
    }
    setPicked(next);
  }

  function chooseScope(s: string) {
    setScope(s);
    applyScope(s, regionIds, categoryIds);
  }
  function toggleRegion(id: string) {
    const next = regionIds.includes(id) ? regionIds.filter((x) => x !== id) : [...regionIds, id];
    setRegionIds(next);
    if (scope === 'FILTER') applyScope('FILTER', next, categoryIds);
  }
  function toggleCategory(id: string) {
    const next = categoryIds.includes(id) ? categoryIds.filter((x) => x !== id) : [...categoryIds, id];
    setCategoryIds(next);
    if (scope === 'FILTER') applyScope('FILTER', regionIds, next);
  }
  function toggleBenefit(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api(`/admin/plans/${plan.id}`, {
        method: 'PATCH',
        body: {
          scope,
          scopeRegionIds: regionIds,
          scopeCategoryIds: categoryIds,
          isPrivate,
          orgCode: isPrivate ? orgCode.trim() : '',
        },
      });
      await api(`/admin/plans/${plan.id}/benefits`, {
        method: 'POST',
        body: { benefitIds: [...picked] },
      });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`쿠폰 범위 — ${plan.name}`} onClose={() => onClose(false)} wide>
      <div className="mb-4 rounded-lg border border-line bg-ground/50 p-3">
        <p className="mb-2 text-xs font-semibold text-ink-3">이 잼은 어떤 쿠폰을 여나요</p>
        <div className="flex flex-col gap-1.5">
          {SCOPES.map(([v, label, hint]) => (
            <label key={v} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" name="scope" checked={scope === v} onChange={() => chooseScope(v)} className="mt-1 size-4" />
              <span>
                <span className="font-medium">{label}</span>
                <span className="ml-2 text-xs text-ink-3">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        {scope === 'FILTER' && (
          <div className="mt-3 space-y-3 border-t border-line pt-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold text-ink-3">지역 — 비우면 모든 지역</p>
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => toggleRegion(r.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      regionIds.includes(r.id) ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-2'
                    }`}
                  >
                    {r.country !== '대한민국' ? `${r.country} ` : ''}{r.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-ink-3">종류 — 비우면 모든 종류</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCategory(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      categoryIds.includes(c.id) ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-2'
                    }`}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-line bg-ground/50 p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-1 size-4" />
          <span>
            <span className="font-medium">단체 전용 잼</span>
            <span className="ml-2 text-xs text-ink-3">코드를 가진 회원에게만 보이고 팔립니다</span>
          </span>
        </label>
        {isPrivate && (
          <input
            className={`${inputCls} mt-2 max-w-[260px]`}
            placeholder="단체 코드 (예: SUYEONG2026)"
            value={orgCode}
            onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
          />
        )}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-3">이 잼에 들어가는 쿠폰</p>
        <Badge>{`${picked.size} / ${benefits?.length ?? 0}장`}</Badge>
      </div>
      <p className="mb-2 text-[11px] text-ink-3">
        성격을 바꾸면 체크가 새로 맞춰집니다. 여기서 몇 개만 더하거나 빼면 그것만 예외로 저장됩니다.
      </p>

      {msg && <p className="mb-2 text-[13px] text-bad">{msg}</p>}

      {!benefits ? (
        <p className="py-8 text-center text-sm text-ink-3">불러오는 중…</p>
      ) : benefits.length === 0 ? (
        <Empty text="등록된 쿠폰이 없습니다" />
      ) : (
        <div className="max-h-[38vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {benefits.map((b) => {
            const on = picked.has(b.id);
            return (
              <label
                key={b.id}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${on ? 'bg-brand/5' : 'hover:bg-ground'}`}
              >
                <input type="checkbox" checked={on} onChange={() => toggleBenefit(b.id)} className="size-4" />
                <span className="min-w-[74px] rounded-md bg-[#FFF1EC] px-2 py-1 text-center text-[13px] font-bold text-[#E8503A]">
                  {valueText(b)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {b.merchant.category?.emoji} {b.merchant.name} · {b.merchant.region?.name}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(false)}>취소</Button>
        <Button onClick={save} disabled={busy || !benefits}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </Modal>
  );
}
