/**
 * 예상 절약액 계산 — 2026-09-09 대표 픽스 + 2026-09-12 할인방식 4종 확정.
 *  - % 쿠폰(PERCENT): 업체의 1인 평균 이용금액(avgSpendPerPerson) × 인원 × %  (기준값 없으면 계산 불가 → null)
 *  - 정액 쿠폰(AMOUNT): 주문 전체에서 깎이는 금액. 인원과 무관.
 *  - 인당 정액(AMOUNT_PER_PERSON): 1인당 금액 × 인원. "5,000원 할인"이 주문당인지 1인당인지 구분하려고 나눴다.
 *  - 증정 쿠폰(FREEBIE): 금액 산정 불가 → null (+α 취급)
 *  - 상품: (정가 − 홀릭잼가) × 인원
 * 동반 한도(companionLimit)가 있으면 본인 포함 한도까지만 인원을 인정한다.
 */

/** 이 쿠폰에 인정되는 인원 — 동반 한도가 있으면 본인 포함 그만큼까지만 */
function coveredPersons(companionLimit: number | null, headcount: number): number {
  return companionLimit != null ? Math.min(headcount, companionLimit + 1) : headcount;
}

export function benefitSaving(
  b: { type: string; value: number; companionLimit: number | null },
  headcount: number,
  avgSpendPerPerson: number | null,
): number | null {
  if (b.type === 'AMOUNT') return b.value;
  if (b.type === 'AMOUNT_PER_PERSON') return b.value * coveredPersons(b.companionLimit, headcount);
  if (b.type === 'PERCENT') {
    if (!avgSpendPerPerson) return null;
    return Math.floor((avgSpendPerPerson * coveredPersons(b.companionLimit, headcount) * b.value) / 100);
  }
  return null; // FREEBIE
}

export function productSaving(
  p: { basePrice: number; memberPrice: number | null },
  headcount: number,
): number {
  if (p.memberPrice == null || p.memberPrice >= p.basePrice) return 0;
  return (p.basePrice - p.memberPrice) * headcount;
}
