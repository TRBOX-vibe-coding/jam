/**
 * 잼이 어떤 쿠폰을 열고, 어떤 상품에 회원가를 주는가.
 *
 * 2026-09-18 대표 확정 — 잼이 수십 개가 되므로(기관별 단체 잼까지) 쿠폰을 잼마다 손으로 담지 않는다.
 * 잼에 성격을 하나 주고, 예외만 따로 더하거나 뺀다.
 *   ALL      모든 쿠폰            예) 잼마스터
 *   FILTER   조건으로 고르기       지역·종류·가게 꼬리표를 함께 건다 (REGION·CATEGORY는 옛 값, 같게 동작)
 *            예) 다낭잼 = 지역 다낭 / 카페잼 = 종류 카페 / 러닝잼 = 지역 부산 + 꼬리표 러닝코스
 *   MANUAL   직접 고른 것만        예) 기획 잼
 * 쿠폰 예외(BenefitGrantRule.isExcluded): 범위 밖이라도 넣기(false) / 범위 안이라도 빼기(true)
 *
 * 2026-09-24 대표 확정(3-5 A) — 상품 회원가도 같은 범위를 따른다. 상품마다 잼을 고르지 않는다.
 *   잼마스터 = 모든 상품 회원가 · 다낭잼 = 다낭 가게 상품만 · 카페잼 = 카페 상품만
 * 다르게 할 상품만 PlanProductRule에 예외로 적는다(더하기/빼기).
 * 가게 꼬리표(Merchant.tags)는 지역·종류로는 못 묶는 가게 모음을 담으려고 더했다 — 부산 곳곳의 러닝코스 가게.
 *
 * 규칙:
 *  - 보기는 누구나 전부. 여기서 가르는 건 '쿠폰 사용'과 '상품 회원가'뿐이다.
 *  - 무료 회원은 아무 쿠폰도 못 쓴다. 단 결제 상품에 묶여 받은 쿠폰만 예외(scan.ts).
 *  - 잼을 여러 개 가지면 합쳐서 쓴다. 그래서 5일잼 중에 잼마스터를 사면 그 자리에서 넓어진다.
 *  - 쿠폰은 시작된 잼으로만 쓰고, 회원가는 미리 결제해 시작 전인 잼도 받는다 (2026-09-12 — 미리 예약하도록).
 */
import type { PrismaService } from './prisma.service';

type Db = PrismaService['client'];

/** 범위를 가를 때 보는 가게 정보 */
export type MerchantScope = { regionId: string; categoryId: string; tags?: string[] | null };
/** 쿠폰·상품 하나 — 어느 가게 것인지만 있으면 된다 */
export type ScopedItem = { id: string; merchant: MerchantScope };
/** 옛 이름 — 쿠폰 하나 */
export type BenefitLike = ScopedItem;
/** 상품 하나 — 회원가가 있어야 회원가 대상이 된다 */
export type ProductLike = ScopedItem & { memberPrice: number | null };

export type PlanLike = {
  id: string;
  scope: string;
  scopeRegionIds: string[];
  scopeCategoryIds: string[];
  scopeTags?: string[] | null;
};

/** prisma select — 범위 계산에 필요한 가게 칸 */
export const MERCHANT_SCOPE_SELECT = { regionId: true, categoryId: true, tags: true } as const;
/** prisma select — 범위 계산에 필요한 잼 칸 */
export const PLAN_SCOPE_SELECT = {
  id: true, scope: true, scopeRegionIds: true, scopeCategoryIds: true, scopeTags: true,
} as const;

/** 잼의 성격만으로 이 쿠폰·상품이 들어오는지 (예외는 따로 얹는다) */
export function scopeCovers(plan: PlanLike, item: ScopedItem): boolean {
  if (plan.scope === 'ALL') return true;
  if (plan.scope === 'MANUAL') return false; // 예외 목록에 넣은 것만
  // 지정한 조건을 모두 만족해야 한다. 비워둔 조건은 제한하지 않는다.
  //   부산 지역 + 카페 종류 = 부산 카페만 / 다낭 지역만 = 다낭 전부 / 부산 + 러닝코스 꼬리표 = 부산 러닝코스 가게만
  const m = item.merchant;
  const tags = plan.scopeTags ?? [];
  const regionOk = plan.scopeRegionIds.length === 0 || plan.scopeRegionIds.includes(m.regionId);
  const categoryOk = plan.scopeCategoryIds.length === 0 || plan.scopeCategoryIds.includes(m.categoryId);
  const tagOk = tags.length === 0 || tags.some((t) => (m.tags ?? []).includes(t));
  return regionOk && categoryOk && tagOk;
}

/**
 * 지금 이 회원이 '쓸 수 있는' 쿠폰 id 집합.
 *
 * 유료 잼 중 이미 시작된 것만 센다(미리 결제한 잼은 시작일 전까지 못 쓴다).
 * 잼을 여러 개 가지면 합집합이다.
 */
export async function usableBenefitIds(db: Db, userId: string | null | undefined): Promise<Set<string>> {
  const usable = new Set<string>();
  if (!userId) return usable;
  const now = new Date();

  const memberships = await db.userMembership.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      startAt: { lte: now },
      endAt: { gt: now },
      plan: { price: { gt: 0 } },
    },
    select: { plan: { select: PLAN_SCOPE_SELECT } },
  });
  if (memberships.length === 0) return usable;

  const benefits = await db.benefit.findMany({
    where: { isActive: true, approval: 'ACTIVE', merchant: { status: 'ACTIVE' } },
    select: { id: true, merchant: { select: MERCHANT_SCOPE_SELECT } },
  });

  const planIds = memberships.map((m) => m.plan.id);
  const exceptions = await db.benefitGrantRule.findMany({
    where: { trigger: 'MEMBERSHIP_PLAN', membershipPlanId: { in: planIds }, isActive: true },
    select: { benefitId: true, membershipPlanId: true, isExcluded: true },
  });
  const key = (planId: string, benefitId: string) => `${planId}:${benefitId}`;
  const added = new Set(exceptions.filter((e) => !e.isExcluded).map((e) => key(e.membershipPlanId!, e.benefitId)));
  const removed = new Set(exceptions.filter((e) => e.isExcluded).map((e) => key(e.membershipPlanId!, e.benefitId)));

  for (const { plan } of memberships) {
    for (const b of benefits) {
      const k = key(plan.id, b.id);
      if (removed.has(k)) continue;
      if (added.has(k) || scopeCovers(plan, b)) usable.add(b.id);
    }
  }
  return usable;
}

/**
 * 이 잼 하나가 여는 쿠폰 id 목록. (구매 전 "무엇이 열리는지" 보여줄 때 쓴다)
 * 살아있는 잼이 아니라 잼 자체의 성격 + 예외로만 계산한다.
 */
export async function benefitIdsForPlan(db: Db, plan: PlanLike): Promise<string[]> {
  const benefits = await db.benefit.findMany({
    where: { isActive: true, approval: 'ACTIVE', merchant: { status: 'ACTIVE' } },
    select: { id: true, merchant: { select: MERCHANT_SCOPE_SELECT } },
  });
  const exceptions = await db.benefitGrantRule.findMany({
    where: { trigger: 'MEMBERSHIP_PLAN', membershipPlanId: plan.id, isActive: true },
    select: { benefitId: true, isExcluded: true },
  });
  const added = new Set(exceptions.filter((e) => !e.isExcluded).map((e) => e.benefitId));
  const removed = new Set(exceptions.filter((e) => e.isExcluded).map((e) => e.benefitId));
  return benefits
    .filter((b) => !removed.has(b.id) && (added.has(b.id) || scopeCovers(plan, b)))
    .map((b) => b.id);
}

// ─────────────────────────── 상품 회원가 (3-5 A) ───────────────────────────

/** 회원가 예외 표 — `잼id:상품id` → 빼기(true) / 더하기(false) */
export async function planProductRules(db: Db, planIds: string[], productIds?: string[]): Promise<Map<string, boolean>> {
  if (planIds.length === 0) return new Map();
  const rows = await db.planProductRule.findMany({
    where: { planId: { in: planIds }, ...(productIds ? { productId: { in: productIds } } : {}) },
    select: { planId: true, productId: true, isExcluded: true },
  });
  return new Map(rows.map((r) => [`${r.planId}:${r.productId}`, r.isExcluded]));
}

/** 잼 하나가 이 상품에 회원가를 주는지 — 잼 범위를 따르고, 예외가 있으면 예외대로 */
export function planGivesMemberPrice(plan: PlanLike, product: ProductLike, rules: Map<string, boolean>): boolean {
  if (product.memberPrice == null) return false;
  const ex = rules.get(`${plan.id}:${product.id}`);
  if (ex === true) return false;
  if (ex === false) return true;
  return scopeCovers(plan, product);
}

/** 회원가를 받는 잼 — 가진 유료 잼 중 끝나지 않은 것 (미리 결제해 시작 전인 잼도 받는다) */
export async function memberPricePlans(db: Db, userId: string | null | undefined): Promise<PlanLike[]> {
  if (!userId) return [];
  const rows = await db.userMembership.findMany({
    where: { userId, status: 'ACTIVE', endAt: { gt: new Date() }, plan: { price: { gt: 0 } } },
    select: { plan: { select: PLAN_SCOPE_SELECT } },
  });
  const byId = new Map(rows.map((r) => [r.plan.id, r.plan]));
  return [...byId.values()];
}

/**
 * 이 회원이 회원가로 사는 상품 id — 목록·상세·결제·찜·가게 화면 모두 이것 하나로 판단한다.
 * 가진 잼 중 하나라도 그 상품에 회원가를 주면 된다.
 */
export async function memberPriceProductIds(
  db: Db,
  userId: string | null | undefined,
  products: ProductLike[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const priced = products.filter((p) => p.memberPrice != null);
  if (!userId || priced.length === 0) return out;
  const plans = await memberPricePlans(db, userId);
  if (plans.length === 0) return out;
  const rules = await planProductRules(db, plans.map((p) => p.id), priced.map((p) => p.id));
  for (const p of priced) {
    if (plans.some((pl) => planGivesMemberPrice(pl, p, rules))) out.add(p.id);
  }
  return out;
}

/** 이 상품에 회원가를 주는 잼 — 판매 중인 공개 잼만 (상품 화면 설명용) */
export async function plansGivingMemberPrice(db: Db, product: ProductLike) {
  if (product.memberPrice == null) return [];
  const plans = await db.membershipPlan.findMany({
    where: { isActive: true, isPrivate: false, price: { gt: 0 } },
    orderBy: { sortOrder: 'asc' },
    select: { ...PLAN_SCOPE_SELECT, code: true, name: true, i18n: true },
  });
  const rules = await planProductRules(db, plans.map((p) => p.id), [product.id]);
  return plans
    .filter((pl) => planGivesMemberPrice(pl, product, rules))
    .map((pl) => ({ id: pl.id, code: pl.code, name: pl.name, i18n: pl.i18n }));
}
