/**
 * 잼이 어떤 쿠폰을 여는가 — 2026-09-18 대표 확정.
 *
 * 잼이 수십 개가 되므로(기관별 단체 잼까지) 쿠폰을 잼마다 손으로 담지 않는다.
 * 잼에 성격을 하나 주고, 예외만 따로 더하거나 뺀다.
 *   ALL      모든 쿠폰            예) 잼마스터
 *   REGION   그 지역 쿠폰만        예) 다낭잼
 *   CATEGORY 그 종류 쿠폰만        예) 카페잼, 스파잼
 *   MANUAL   직접 고른 것만        예) 기획 잼
 * 예외(BenefitGrantRule.isExcluded): 범위 밖이라도 넣기(false) / 범위 안이라도 빼기(true)
 *   예) 잼마스터(부산시 공무원노조) = ALL 에서 몇 개 빼기
 *
 * 규칙:
 *  - 보기는 누구나 전부. 여기서 가르는 건 '사용'과 '상품 할인가'뿐이다.
 *  - 무료 회원은 아무 쿠폰도 못 쓴다. 단 결제 상품에 묶여 받은 쿠폰만 예외(scan.ts).
 *  - 잼을 여러 개 가지면 합쳐서 쓴다. 그래서 5일잼 중에 잼마스터를 사면 그 자리에서 넓어진다.
 */
import type { PrismaService } from './prisma.service';

type Db = PrismaService['client'];

/** 쿠폰 하나가 이 잼에 들어오는지 판단할 때 필요한 최소 정보 */
export type BenefitLike = {
  id: string;
  merchant: { regionId: string; categoryId: string };
};

export type PlanLike = {
  id: string;
  scope: string;
  scopeRegionIds: string[];
  scopeCategoryIds: string[];
};

/** 잼의 성격만으로 이 쿠폰이 들어오는지 (예외는 따로 얹는다) */
export function scopeCovers(plan: PlanLike, b: BenefitLike): boolean {
  if (plan.scope === 'ALL') return true;
  if (plan.scope === 'REGION') return plan.scopeRegionIds.includes(b.merchant.regionId);
  if (plan.scope === 'CATEGORY') return plan.scopeCategoryIds.includes(b.merchant.categoryId);
  return false; // MANUAL — 예외 목록에 넣은 것만
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
    select: { plan: { select: { id: true, scope: true, scopeRegionIds: true, scopeCategoryIds: true } } },
  });
  if (memberships.length === 0) return usable;

  const benefits = await db.benefit.findMany({
    where: { isActive: true, approval: 'ACTIVE', merchant: { status: 'ACTIVE' } },
    select: { id: true, merchant: { select: { regionId: true, categoryId: true } } },
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
 * 지금 이 회원이 가진 유료 잼(이미 시작된 것)의 id 목록.
 * 상품 할인가는 상품마다 지정한 잼을 가졌는지로 판단한다.
 */
export async function activePaidPlanIds(db: Db, userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const now = new Date();
  const rows = await db.userMembership.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      startAt: { lte: now },
      endAt: { gt: now },
      plan: { price: { gt: 0 } },
    },
    select: { planId: true },
  });
  return [...new Set(rows.map((r) => r.planId))];
}

/**
 * 이 상품의 유료 회원 할인가를 받을 수 있는지.
 * memberPricePlanIds가 비어 있으면 '유료 잼이면 모두'(기존 동작).
 *
 * 미리 결제해 아직 시작 전인 잼도 상품 할인은 받는다 — 여행 전에 미리 예약하도록 밀어주는 쪽이 맞다.
 */
export async function canGetMemberPrice(
  db: Db,
  userId: string | null | undefined,
  memberPricePlanIds: string[],
): Promise<boolean> {
  if (!userId) return false;
  const now = new Date();
  const rows = await db.userMembership.findMany({
    where: { userId, status: 'ACTIVE', endAt: { gt: now }, plan: { price: { gt: 0 } } },
    select: { planId: true },
  });
  if (rows.length === 0) return false;
  if (!memberPricePlanIds || memberPricePlanIds.length === 0) return true;
  return rows.some((r) => memberPricePlanIds.includes(r.planId));
}
