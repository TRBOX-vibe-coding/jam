/**
 * 상품 판매 기간·이용 기간 — 2026-09-19 문서 4-6, 대표가 '오픈 전 필수'로 체크.
 *
 *   판매 기간  이 기간에만 결제된다. 비우면 제한 없음. 손님 목록에는 지금 판매 중인 상품만 보인다
 *   이용 기간  이용권을 쓸 수 있는 기간 (티켓·PASS). 비우면 산 날부터 30일. 예약 상품은 회차가 곧 이용일
 *   이용 시작일이 있는 티켓은 대표 규정의 '날짜 있는 티켓(불꽃축제 등)'으로 보고,
 *   취소 규정을 이용일 기준(이틀 전 100% · 하루 전 50% · 당일 0%)으로 계산한다 (admin-orders.ts)
 *
 * 날짜는 모두 그 날 0시로 저장하고, 끝나는 날은 그 날 23:59까지로 본다.
 */
import { dayKey, dayLabel, dayStart, parseDay } from './bundled-coupons.util';

const DAY = 86_400_000;
/** 이용 기간이 없는 티켓·PASS 이용권을 쓸 수 있는 날 수 */
export const TICKET_VALID_DAYS = 30;

export type Period = { saleFrom: Date | null; saleTo: Date | null; useFrom: Date | null; useTo: Date | null };
export type PeriodInput = { saleFrom?: string | null; saleTo?: string | null; useFrom?: string | null; useTo?: string | null };

/** 끝나는 날의 다음 날 0시 — 이 시각 전까지가 그 날 23:59까지다 */
export const endOfDay = (d: Date) => new Date(dayStart(d).getTime() + DAY);

/** 판매 상태 — 판매 전 · 판매 중 · 판매 끝 */
export function saleState(p: { saleFrom: Date | null; saleTo: Date | null }, now = new Date()): 'UPCOMING' | 'ON' | 'ENDED' {
  if (p.saleFrom && now < dayStart(p.saleFrom)) return 'UPCOMING';
  if (p.saleTo && now >= endOfDay(p.saleTo)) return 'ENDED';
  return 'ON';
}

/** prisma where — 지금 판매 중인 상품만 */
export function onSaleWhere(now = new Date()) {
  return {
    AND: [
      { OR: [{ saleFrom: null }, { saleFrom: { lte: now } }] },
      { OR: [{ saleTo: null }, { saleTo: { gt: new Date(now.getTime() - DAY) } }] },
    ],
  };
}

/** 이용권을 쓸 수 있는 기간 — 이용 기간이 있으면 그것, 없으면 산 날부터 30일 */
export function voucherWindow(p: { useFrom: Date | null; useTo: Date | null }, now = new Date()) {
  const validFrom = p.useFrom && dayStart(p.useFrom) > now ? dayStart(p.useFrom) : now;
  const validTo = p.useTo ? endOfDay(p.useTo) : new Date(validFrom.getTime() + TICKET_VALID_DAYS * DAY);
  return { validFrom, validTo };
}

/** 화면용 'YYYY-MM-DD' 네 칸 — 폰의 시간대와 상관없이 같은 날로 읽게 글자로 내려준다 */
export function periodKeys(p: { saleFrom: Date | null; saleTo: Date | null; useFrom: Date | null; useTo: Date | null }) {
  const k = (d: Date | null) => (d ? dayKey(d) : null);
  return { saleFrom: k(p.saleFrom), saleTo: k(p.saleTo), useFrom: k(p.useFrom), useTo: k(p.useTo) };
}

/**
 * 이용일이 하루로 정해진 티켓(불꽃축제처럼) — 그 날이 곧 '가는 날'이다.
 * 손님에게 가는 날을 묻지 않고, 딸려 받은 쿠폰도 그 날 0시에 저절로 열린다 (bundled-coupons.util.ts).
 */
export function fixedUseDay(p: { type: string; useFrom: Date | null; useTo: Date | null }): Date | null {
  if (p.type === 'RESERVATION' || !p.useFrom || !p.useTo) return null;
  return dayStart(p.useFrom).getTime() === dayStart(p.useTo).getTime() ? dayStart(p.useFrom) : null;
}

/** 날짜 있는 티켓 — 이용 시작일이 정해진 티켓·PASS (대표 규정의 '불꽃축제 등') */
export const isDatedTicket = (p: { type: string; useFrom: Date | null }) => p.type !== 'RESERVATION' && !!p.useFrom;

/**
 * 화면에서 받은 'YYYY-MM-DD' 네 칸을 저장할 값으로. 빈 값은 지우기(null), 안 보낸 칸은 그대로 둔다.
 * 예약 상품은 이용 기간을 쓰지 않는다(회차가 곧 이용일).
 */
export function parsePeriod(dto: PeriodInput, type: string, current?: Period): { data: Partial<Period>; error?: string } {
  const data: Partial<Period> = {};
  for (const k of ['saleFrom', 'saleTo', 'useFrom', 'useTo'] as const) {
    const v = dto[k];
    if (v === undefined) continue;
    if (v === null || v === '') { data[k] = null; continue; }
    const d = parseDay(v);
    if (!d) return { data, error: '날짜를 다시 확인해 주세요' };
    data[k] = d;
  }
  if (type === 'RESERVATION') { data.useFrom = null; data.useTo = null; }
  const m: Period = {
    saleFrom: current?.saleFrom ?? null, saleTo: current?.saleTo ?? null,
    useFrom: current?.useFrom ?? null, useTo: current?.useTo ?? null,
    ...data,
  };
  if (m.saleFrom && m.saleTo && m.saleFrom > m.saleTo) return { data, error: '판매 시작일이 판매 끝나는 날보다 늦습니다' };
  if (m.useFrom && m.useTo && m.useFrom > m.useTo) return { data, error: '이용 시작일이 이용 끝나는 날보다 늦습니다' };
  if (m.saleTo && m.useTo && m.saleTo > m.useTo) {
    return { data, error: `판매는 이용 기간이 끝나는 날(${dayLabel(m.useTo)})까지만 할 수 있습니다` };
  }
  return { data };
}
