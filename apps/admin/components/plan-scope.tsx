'use client';
/**
 * 잼이 여는 쿠폰과 회원가 상품 — 2026-09-18 대표 확정, 2026-09-24 회원가·꼬리표 더함(3-5 A).
 *
 * 잼이 수십 개가 되므로(기관별 단체 잼까지) 쿠폰을 잼마다 손으로 담지 않는다.
 * 잼에 성격을 하나 주고, 성격과 다른 것만 예외로 더하거나 뺀다.
 *   전부 / 조건으로 고르기(지역·종류·가게 꼬리표) / 직접 고르기
 * 성격을 바꾸면 체크가 그 성격대로 새로 맞춰지고, 거기서 몇 개만 손대면 된다.
 * 상품 회원가도 같은 범위를 따른다. 상품 하나만 다르게 하는 예외는 상품 목록의 [회원가 잼]에서 고친다.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Empty, Modal } from '@/components/ui';

const inputCls =
  'h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand';

const SCOPES: [string, string, string][] = [
  ['ALL', '전부', '모든 가게 — 잼마스터'],
  ['FILTER', '조건으로 고르기', '지역·종류·가게 꼬리표를 함께 건다 — 다낭잼, 카페잼, 러닝잼(부산 + 러닝코스)'],
  ['MANUAL', '직접 고르기', '아래에서 체크한 쿠폰만 — 기획 잼'],
];

type Merch = { regionId: string; categoryId: string; tags?: string[] };

function valueText(b: { type: string; value: number; freebieName?: string | null }) {
  if (b.type === 'PERCENT') return `${b.value}%`;
  if (b.type === 'AMOUNT') return `${b.value.toLocaleString()}원`;
  if (b.type === 'AMOUNT_PER_PERSON') return `1인당 ${b.value.toLocaleString()}원`;
  return b.freebieName ?? '증정';
}

/** 잼 성격만으로 이 가게가 들어오는지 — 서버의 scopeCovers와 같은 계산 (api/src/plan-scope.util.ts) */
function covers(scope: string, regions: string[], categories: string[], tags: string[], m: Merch) {
  if (scope === 'ALL') return true;
  if (scope === 'MANUAL') return false;
  return (
    (regions.length === 0 || regions.includes(m.regionId)) &&
    (categories.length === 0 || categories.includes(m.categoryId)) &&
    (tags.length === 0 || tags.some((t) => (m.tags ?? []).includes(t)))
  );
}

function Chip({ on, onClick, tone = 'brand', children }: { on: boolean; onClick: () => void; tone?: 'brand' | 'ok'; children: React.ReactNode }) {
  const onCls = tone === 'ok' ? 'border-ok bg-ok text-white' : 'border-brand bg-brand text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? onCls : 'border-line bg-white text-ink-2'}`}
    >
      {children}
    </button>
  );
}

export function PlanScopeModal({
  plan,
  onClose,
}: {
  plan: { id: string; name: string };
  onClose: (saved?: boolean) => void;
}) {
  const [benefits, setBenefits] = useState<any[] | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<{ tag: string; merchants: number }[]>([]);
  const [scope, setScope] = useState('ALL');
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [orgCode, setOrgCode] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<any>(`/admin/plans/${plan.id}/benefits`)
      .then((r) => {
        setBenefits(r.benefits);
        setScope(['REGION', 'CATEGORY', 'FILTER'].includes(r.plan.scope) ? 'FILTER' : r.plan.scope ?? 'ALL');
        setRegionIds(r.plan.scopeRegionIds ?? []);
        setCategoryIds(r.plan.scopeCategoryIds ?? []);
        setTags(r.plan.scopeTags ?? []);
        setIsPrivate(!!r.plan.isPrivate);
        setOrgCode(r.plan.orgCode ?? '');
        setPicked(new Set(r.benefits.filter((b: any) => b.included).map((b: any) => b.id)));
      })
      .catch((e) => setMsg(e.message));
    api<any[]>(`/admin/plans/${plan.id}/products`).then(setProducts).catch(() => {});
    api<any[]>('/admin/regions').then(setRegions).catch(() => {});
    api<any[]>('/admin/categories').then(setCategories).catch(() => {});
    api<{ tag: string; merchants: number }[]>('/admin/merchant-tags').then(setAllTags).catch(() => {});
  }, [plan.id]);

  /** 성격을 바꾸면 쿠폰 체크를 그 성격대로 새로 맞춘다 */
  function applyScope(s: string, rs: string[], cs: string[], ts: string[]) {
    if (!benefits) return;
    setPicked(new Set(benefits.filter((b) => covers(s, rs, cs, ts, b.merchant)).map((b) => b.id)));
  }
  function chooseScope(s: string) {
    setScope(s);
    applyScope(s, regionIds, categoryIds, tags);
  }
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  function toggleRegion(id: string) {
    const next = flip(regionIds, id);
    setRegionIds(next);
    applyScope(scope, next, categoryIds, tags);
  }
  function toggleCategory(id: string) {
    const next = flip(categoryIds, id);
    setCategoryIds(next);
    applyScope(scope, regionIds, next, tags);
  }
  function toggleTag(t: string) {
    const next = flip(tags, t);
    setTags(next);
    applyScope(scope, regionIds, categoryIds, next);
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
          scopeRegionIds: scope === 'FILTER' ? regionIds : [],
          scopeCategoryIds: scope === 'FILTER' ? categoryIds : [],
          scopeTags: scope === 'FILTER' ? tags : [],
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

  // 회원가 상품 — 지금 화면의 범위로 바로 다시 계산하고, 상품마다 정한 예외를 얹는다
  const priced = products.map((p) => {
    const inScope = covers(scope, regionIds, categoryIds, tags, p.merchant);
    const gives = p.rule === 'REMOVE' ? false : p.rule === 'ADD' ? true : inScope;
    return { ...p, gives };
  });
  const givesCount = priced.filter((p) => p.gives).length;
  const taggedCount = (t: string) => allTags.find((x) => x.tag === t)?.merchants ?? 0;

  return (
    <Modal title={`쿠폰·회원가 범위 — ${plan.name}`} onClose={() => onClose(false)} wide>
      <div className="mb-4 rounded-lg border border-line bg-ground/50 p-3">
        <p className="mb-2 text-xs font-semibold text-ink-3">이 잼은 어떤 가게의 쿠폰과 회원가를 여나요</p>
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
                  <Chip key={r.id} on={regionIds.includes(r.id)} onClick={() => toggleRegion(r.id)}>
                    {r.country !== '대한민국' ? `${r.country} ` : ''}{r.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-ink-3">종류 — 비우면 모든 종류</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <Chip key={c.id} on={categoryIds.includes(c.id)} onClick={() => toggleCategory(c.id)}>
                    {c.emoji} {c.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-ink-3">가게 꼬리표 — 비우면 제한 없음 · 고르면 그 꼬리표가 붙은 가게만</p>
              {allTags.length === 0 && tags.length === 0 ? (
                <p className="text-[12px] text-ink-3">아직 붙인 꼬리표가 없습니다. 가맹점 [수정]에서 붙이면 여기서 고를 수 있습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set([...allTags.map((t) => t.tag), ...tags])].map((t) => (
                    <Chip key={t} tone="ok" on={tags.includes(t)} onClick={() => toggleTag(t)}>
                      {t} <span className="opacity-70">{taggedCount(t)}곳</span>
                    </Chip>
                  ))}
                </div>
              )}
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
        <div className="max-h-[32vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
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
                    {(b.merchant.tags ?? []).map((t: string) => (
                      <span key={t} className="ml-1.5 rounded-full bg-ok-soft px-1.5 py-px text-[10px] font-bold text-ok">{t}</span>
                    ))}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* 회원가도 같은 범위를 따른다 (2026-09-24 대표 확정 3-5 A) */}
      <div className="mb-2 mt-5 flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-3">회원가를 받는 상품 — 위 범위를 그대로 따릅니다</p>
        <Badge>{`${givesCount} / ${products.length}개`}</Badge>
      </div>
      <p className="mb-2 text-[11px] text-ink-3">
        위에서 범위를 바꾸면 여기도 바로 바뀝니다. 상품 하나만 다르게 하려면 상품 목록의 [회원가 잼]에서 바꿉니다.
      </p>
      {products.length === 0 ? (
        <p className="rounded-lg border border-line px-3 py-4 text-center text-[13px] text-ink-3">회원가가 있는 판매 중 상품이 없습니다</p>
      ) : (
        <div className="max-h-[24vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {priced.map((p) => (
            <div key={p.id} className={`flex items-center gap-3 px-3 py-2 ${p.gives ? '' : 'opacity-55'}`}>
              <span className={`w-[64px] shrink-0 rounded-md px-2 py-1 text-center text-[11px] font-bold ${p.gives ? 'bg-brand-soft text-brand' : 'bg-ground text-ink-3'}`}>
                {p.gives ? '회원가' : '정상가'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-ink-3">
                  {p.merchant.name} · {p.merchant.region?.name} · {p.basePrice.toLocaleString()}원 → {p.memberPrice.toLocaleString()}원
                </span>
              </span>
              {p.rule && (
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${p.rule === 'ADD' ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
                  {p.rule === 'ADD' ? '예외: 더함' : '예외: 뺌'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(false)}>취소</Button>
        <Button onClick={save} disabled={busy || !benefits}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </Modal>
  );
}
