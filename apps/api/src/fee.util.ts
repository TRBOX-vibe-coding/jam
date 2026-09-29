/**
 * 가게 수수료 — 2026-09-29 대표 확정.
 *
 *   "가게에는 무조건 수수료만 떼는 거임. 수수료는 정할 수 있게 해야 함. 기본 10%이지만 상품에 따라 달라질 수 있음."
 *
 *   - 수수료율은 상품에 정해 두면 그것, 비우면 가게 기본 수수료율(새 가게는 10%)을 쓴다.
 *   - 가게에서 사용 처리한 이용권 판매액에서 수수료만 떼고 가게에 준다.
 *   - 취소하고 남은 돈(예: 하루 전 취소로 돌려주지 않은 50%)도 가게 몫이다 — 여기서도 수수료만 뗀다.
 * 계산은 정산 만들기(admin.ts settlements/generate)와 취소 창(admin-orders.ts)이 함께 쓴다.
 */

/** 새 가게의 기본 수수료율(%) */
export const DEFAULT_COMMISSION = 10;

type Rate = { toString(): string } | number | null | undefined;

/** 이 상품에 적용할 수수료율(%) — 상품에 있으면 그것, 없으면 가게 기본 */
export function feeRate(product: { commissionRate?: Rate } | null | undefined, merchant: { commissionRate: Rate }): number {
  const p = product?.commissionRate;
  if (p != null) return Number(p);
  return merchant.commissionRate != null ? Number(merchant.commissionRate) : DEFAULT_COMMISSION;
}

/** 수수료 금액 — 원 단위 아래는 버린다(가게에 유리하게) */
export const feeOf = (amount: number, rate: number) => Math.floor((amount * rate) / 100);
