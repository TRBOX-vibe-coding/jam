/**
 * 상품에 딸려 받은 '근처 할인 쿠폰'이 언제 열리는가 — 2026-09-24 대표 확정(3-2).
 *
 *   예약 상품   예약한 날 0시
 *   티켓·PASS   손님이 결제할 때 고른 '가는 날' 0시. 안 고르면 가게에서 이용권을 쓸 때
 *   먼저 쓰면   고른 날보다 먼저 가서 이용권을 쓰면 그 자리에서 바로 연다 (scan.ts)
 *
 * 전에는 본사가 상품마다 '쿠폰 여는 때'를 골랐는데, 이제 위 규칙으로 저절로 정해진다.
 * 쿠폰은 (손님, 쿠폰, 상품)마다 한 벌이라 같은 상품을 여러 장 샀으면 가장 이른 날에 맞춘다.
 * 이미 열린 쿠폰은 건드리지 않는다 — 가는 날을 바꿔도 열린 쿠폰이 다시 잠기지 않는다.
 */
import type { Prisma } from '@prisma/client';
import { PRODUCT_COUPON_VALID_DAYS } from './membership.util';
import { addDays } from './util';

type Tx = Prisma.TransactionClient;

/** 그 날 0시 — 예약 상품의 '예약한 날 0시'와 같은 방식(서버 시각) */
export function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 'YYYY-MM-DD' → 그 날 0시. 없는 날짜면 null */
export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(y, mo - 1, d);
  if (day.getFullYear() !== y || day.getMonth() !== mo - 1 || day.getDate() !== d) return null;
  return day;
}

/** 그 날을 'YYYY-MM-DD'로 — 앱이 시간대와 상관없이 같은 날로 읽게 문자열로 보낸다 */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'M월 D일' */
export function dayLabel(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 가는 날로 고를 수 있는 범위 — 오늘부터 이용권을 쓸 수 있는 마지막 날까지 */
export function visitDateRange(now: Date, voucherValidTo: Date) {
  return { from: dayStart(now), to: dayStart(new Date(voucherValidTo.getTime() - 1)) };
}

/** 가는 날이 범위 안인지. 틀리면 손님에게 보여줄 말을 돌려준다 */
export function visitDateError(day: Date | null, now: Date, voucherValidTo: Date): string | null {
  if (!day) return '가는 날을 다시 골라 주세요';
  const r = visitDateRange(now, voucherValidTo);
  if (day < r.from || day > r.to) {
    const from = r.from.getTime() === dayStart(new Date()).getTime() ? '오늘' : dayLabel(r.from);
    return `가는 날은 ${from}부터 ${dayLabel(r.to)}까지 고를 수 있습니다`;
  }
  return null;
}

/**
 * 아직 안 열린 쿠폰의 여는 날을 이 손님이 가진 이용권에 맞춘다.
 * 결제 · 가는 날 바꾸기 · 주문 취소 뒤에 부른다.
 * @returns 쿠폰이 열리는 날. null이면 가게에서 이용권을 쓸 때 열린다
 */
export async function syncBundledCoupons(tx: Tx, userId: string, productId: string, now = new Date()): Promise<Date | null> {
  const coupons = await tx.userBenefit.findMany({
    where: { userId, sourceType: 'PRODUCT', sourceId: productId, status: { in: ['PENDING', 'ACTIVE'] } },
    select: { id: true, benefitId: true, status: true, validFrom: true },
  });
  const waiting = coupons.filter((c) => c.status === 'PENDING' || c.validFrom > now);
  if (waiting.length === 0) return null;

  // 아직 쓸 수 있는 이용권만 본다 — 없으면 그대로 둔다 (취소는 admin-orders.ts가 거둬들인다)
  const vouchers = await tx.voucher.findMany({
    where: { userId, productId, status: { in: ['ISSUED', 'RESERVED'] }, validTo: { gt: now } },
    select: {
      visitDate: true, validTo: true,
      reservation: { select: { status: true, slot: { select: { startAt: true } } } },
    },
  });
  if (vouchers.length === 0) return null;

  const days = vouchers
    .map((v) => (v.reservation?.status === 'CONFIRMED' ? dayStart(v.reservation.slot.startAt) : v.visitDate))
    .filter((d): d is Date => !!d);
  const opensAt = days.length ? new Date(Math.min(...days.map((d) => d.getTime()))) : null;
  const lastValid = new Date(Math.max(...vouchers.map((v) => v.validTo.getTime())));

  const rules = await tx.benefitGrantRule.findMany({
    where: { trigger: 'PRODUCT', productId },
    select: { benefitId: true, validDays: true },
  });
  const daysOf = new Map(rules.map((r) => [r.benefitId, r.validDays]));
  for (const c of waiting) {
    await tx.userBenefit.update({
      where: { id: c.id },
      data: opensAt
        ? {
            status: 'ACTIVE',
            validFrom: opensAt,
            validTo: addDays(opensAt, daysOf.get(c.benefitId) ?? PRODUCT_COUPON_VALID_DAYS),
          }
        // 날짜가 없으면 잠가 두고, 이용권이 살아 있는 동안은 사라지지 않게 이용권 기한을 따라간다
        : { status: 'PENDING', validFrom: now, validTo: lastValid },
    });
  }
  return opensAt;
}
