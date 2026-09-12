import type { PrismaService } from './prisma.service';

type Db = PrismaService['client'];

/**
 * 유료 잼 회원인지 — FREE 플랜(price 0)은 제외한다.
 *
 * 2026-09-12 대표 확정: 상품의 '유료 회원 가격'은 유료 잼 보유자만 받는다.
 * 미리 결제하고 아직 시작 전인 잼도 인정한다 — 여행 전에 미리 예약하도록 밀어주는 쪽이 맞다.
 * (쿠폰 '사용'은 시작일이 지나야 하므로 판정이 다르다. scan.ts 참고)
 */
export async function isPaidMember(db: Db, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const m = await db.userMembership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      endAt: { gt: new Date() },
      plan: { price: { gt: 0 } },
    },
    select: { id: true },
  });
  return !!m;
}

/**
 * 결제 상품에 묶어둔 쿠폰의 기본 사용 기간(일).
 * BenefitGrantRule.validDays로 상품별 조정 가능.
 */
export const PRODUCT_COUPON_VALID_DAYS = 90;

/**
 * 이 쿠폰을 '상품 결제로 받아서' 지금 쓸 수 있는지.
 *
 * 2026-09-12 대표 확정 — 유료 전환 유도의 핵심.
 * 무료 회원이라도 결제 상품에 묶인 쿠폰은 실제로 사용할 수 있다.
 * 이 함수가 그 예외를 통과시키는 유일한 경로다.
 */
export async function hasProductGrantedCoupon(db: Db, userId: string, benefitId: string): Promise<boolean> {
  const now = new Date();
  const ub = await db.userBenefit.findFirst({
    where: {
      userId,
      benefitId,
      sourceType: 'PRODUCT',
      status: 'ACTIVE',
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    select: { id: true },
  });
  return !!ub;
}
