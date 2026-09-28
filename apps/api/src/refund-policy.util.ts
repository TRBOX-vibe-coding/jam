/**
 * 취소·환불 규정 — 2026-09-24·09-28 대표 확정.
 *
 *   예약 상품(날짜 있는 것)  이용 당일 취소는 환불 없음 · 하루 전 50% · 이틀 전부터 100%
 *   날짜 없는 티켓·PASS      구매 후 3개월 안이면 환불 (사용 전에 한해)
 *   잼(멤버십)               시작일 전 취소는 100% · 시작일부터는 환불 없음
 *   딸려 받은 쿠폰            하나라도 쓰면 그 상품은 취소 안 됨
 *   결제 직후                정해 둔 시간 안이면 무엇이든 전액 (공정위 권고, 야놀자·여기어때 10분~1시간)
 *
 * 숫자는 본사가 관리자 화면 '설정'에서 바꾼다. 대표가 "물어보지 말고 슈퍼 관리자가 정하게 하자"고 해서
 * 코드에 박지 않고 Setting 테이블에 둔다. 비어 있으면 아래 기본값을 쓴다.
 *
 * 지금(C 방식)은 손님이 직접 취소하지 않는다. 손님이 요청하면 본사가 토스 상점관리자에서 환불하고,
 * 홀릭잼 관리자 화면에서 '취소'를 눌러 기록한다. 여기서 계산하는 금액은 본사에게 보여주는 권장값이다.
 */
import type { PrismaService } from './prisma.service';

type Db = PrismaService['client'];

export type RefundPolicy = {
  /** 결제 후 이 시간(분) 안에 취소하면 무엇이든 전액 */
  graceMinutes: number;
  /** 예약 상품 — 이용 당일(이용 시각이 지난 뒤 포함) 취소 시 돌려주는 비율(%) */
  sameDayPercent: number;
  /** 예약 상품 — 이용 하루 전 취소 */
  dayBeforePercent: number;
  /** 예약 상품 — 이용 이틀 전부터 */
  twoDaysBeforePercent: number;
  /** 날짜 없는 티켓·PASS — 구매 후 몇 개월까지 환불하는지 */
  undatedMonths: number;
  /** 손님이 취소를 요청하는 곳 — 앱 안내에 그대로 나온다. 예) 카카오톡 '홀릭잼' 채널 */
  csContact: string;
  /** 눌렀을 때 열 주소 (선택). 예) 카카오톡 채널 주소 */
  csLink: string;
};

export const DEFAULT_REFUND_POLICY: RefundPolicy = {
  graceMinutes: 10,
  sameDayPercent: 0,
  dayBeforePercent: 50,
  twoDaysBeforePercent: 100,
  undatedMonths: 3,
  csContact: '',
  csLink: '',
};

export const REFUND_POLICY_KEY = 'refundPolicy';

export async function getRefundPolicy(db: Db): Promise<RefundPolicy> {
  const row = await db.setting.findUnique({ where: { key: REFUND_POLICY_KEY } });
  const saved = (row?.value ?? {}) as Partial<RefundPolicy>;
  return { ...DEFAULT_REFUND_POLICY, ...saved };
}

const DAY = 24 * 60 * 60 * 1000;

/** 달력 날짜로 며칠 전인지 — 시각은 무시한다. 27일 10시 이용을 26일 23시에 취소해도 '하루 전'이다. */
export function calendarDaysBefore(useAt: Date, now: Date): number {
  const d = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((d(useAt) - d(now)) / DAY);
}

export type RefundRule = {
  percent: number;
  /** 본사에게 보여줄 한 줄 설명 */
  reason: string;
};

/** 예약 상품 — 이용일 기준 */
export function reservationRule(p: RefundPolicy, useAt: Date, paidAt: Date | null, now: Date): RefundRule {
  if (paidAt && now.getTime() - paidAt.getTime() <= p.graceMinutes * 60_000) {
    return { percent: 100, reason: `결제 후 ${p.graceMinutes}분 안에 취소 — 전액` };
  }
  const days = calendarDaysBefore(useAt, now);
  if (days >= 2) return { percent: p.twoDaysBeforePercent, reason: `이용 ${days}일 전 취소 — ${p.twoDaysBeforePercent}%` };
  if (days === 1) return { percent: p.dayBeforePercent, reason: `이용 하루 전 취소 — ${p.dayBeforePercent}%` };
  if (days === 0) return { percent: p.sameDayPercent, reason: `이용 당일 취소 — ${p.sameDayPercent}%` };
  return { percent: p.sameDayPercent, reason: `이용일이 이미 지남 — ${p.sameDayPercent}%` };
}

/** 날짜 없는 티켓·PASS·결제 딜 — 구매일 기준 */
export function undatedRule(p: RefundPolicy, paidAt: Date | null, now: Date): RefundRule {
  if (paidAt && now.getTime() - paidAt.getTime() <= p.graceMinutes * 60_000) {
    return { percent: 100, reason: `결제 후 ${p.graceMinutes}분 안에 취소 — 전액` };
  }
  if (!paidAt) return { percent: 100, reason: `구매 후 ${p.undatedMonths}개월 안 — 전액` };
  const limit = new Date(paidAt);
  limit.setMonth(limit.getMonth() + p.undatedMonths);
  if (now <= limit) return { percent: 100, reason: `구매 후 ${p.undatedMonths}개월 안 — 전액` };
  return { percent: 0, reason: `구매 후 ${p.undatedMonths}개월이 지남 — 환불 없음` };
}
