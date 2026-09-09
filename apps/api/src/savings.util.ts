/**
 * 예상 절약액 계산 — 2026-09-09 대표 픽스 규칙.
 *  - % 쿠폰: 업체의 1인 평균 이용금액(avgSpendPerPerson) × 인원 × %  (기준값 없으면 계산 불가 → null)
 *  - 정액 쿠폰: 금액 그대로 (대표 예시대로 인원 곱하지 않음)
 *  - 증정 쿠폰: 금액 산정 불가 → null (+α 취급)
 *  - 상품: (정가 − 홀릭잼가) × 인원
 * 동반 한도(companionLimit)가 있으면 본인 포함 한도까지만 인원을 인정한다.
 */

export function benefitSaving(
  b: { type: string; value: number; companionLimit: number | null },
  headcount: number,
  avgSpendPerPerson: number | null,
): number | null {
  if (b.type === 'AMOUNT') return b.value;
  if (b.type === 'PERCENT') {
    if (!avgSpendPerPerson) return null;
    const persons = b.companionLimit != null ? Math.min(headcount, b.companionLimit + 1) : headcount;
    return Math.floor((avgSpendPerPerson * persons * b.value) / 100);
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
