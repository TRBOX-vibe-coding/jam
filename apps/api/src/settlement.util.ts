/**
 * 정산 — 정산일과 계산.
 *
 * 정산일 — 2026-09-29 사용자 결정:
 *   "정산 날짜는 PG(토스)를 붙일 때 홀릭잼 대표가 정한 날짜로, 바꿀 수도 있게. 우리는 시스템으로 정산 날짜를 정하게 해 주면 된다."
 *   "날짜 지정이 맞다 — 예) 매달 15일, 또는 매달 15일·30일. 그래야 관리자가 정산 관리가 쉽다."
 *   본사가 설정에서 매달 정산일을 하루나 이틀 고른다. 정산일마다 '지난 정산일부터 그 전날까지' 가게에서 사용 처리된 것을
 *   정산한다 — 예) 매달 15일이면 11월 15일~12월 14일 사용분을 12월 15일에 보낸다. 정산일 0시에 그 기간의 정산이
 *   저절로 만들어진다(settlement-auto.ts). 가게 정산 화면에는 정산일과 지급 예정일이 보인다.
 *   정산일을 바꿀 때 가게에 알리는 것은 홀릭잼 본사 몫이다.
 * 계산 — 결제한 날이 아니라 가게에서 사용 처리한 날 기준이다. 2026-09-29 사용자: "결제일 기준으로 정산했다가 취소하면
 *   정리가 더 힘들다" — 사용 처리된 이용권은 취소가 안 되니 정산한 돈이 뒤집히지 않는다.
 *   ① 가게에서 사용 처리된 이용권의 판매액 ② 취소하고 돌려주지 않은 돈(가게 몫, 취소한 날 기준). 수수료만 뗀다(2026-09-29 대표 확정).
 */
import { PrismaService } from './prisma.service';
import { feeOf, feeRate } from './fee.util';

type Db = PrismaService['client'];

/** 매달 정산일 — 하루면 한 달에 한 번, 이틀이면 두 번. 31은 말일 */
export type SettlementPolicy = { payDays: number[] };

export const SETTLEMENT_POLICY_KEY = 'settlementPolicy';
export const LAST_DAY = 31;
export const DEFAULT_SETTLEMENT_POLICY: SettlementPolicy = { payDays: [15, 30] };

export const dayLabel = (d: number) => (d >= LAST_DAY ? '말일' : `${d}일`);
export const policyLabel = (p: SettlementPolicy) => `매달 ${p.payDays.map(dayLabel).join('·')}`;
export const POLICY_NOTE = '정산일마다 지난 정산일부터 그 전날까지 가게에서 사용 처리된 것을 보냅니다 (결제한 날이 아니라 사용 처리한 날 기준)';

/** 저장된 값을 그대로 믿지 않는다 — 1~31일 가운데 서로 다른 하루나 이틀 */
export function normalizePolicy(v: unknown): SettlementPolicy {
  const raw = (v as { payDays?: unknown } | null)?.payDays;
  const days = Array.isArray(raw) ? raw.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= LAST_DAY) : [];
  const uniq = [...new Set(days)].sort((a, b) => a - b).slice(0, 2);
  return uniq.length ? { payDays: uniq } : DEFAULT_SETTLEMENT_POLICY;
}

export async function getSettlementPolicy(db: Db): Promise<SettlementPolicy> {
  const row = await db.setting.findUnique({ where: { key: SETTLEMENT_POLICY_KEY } });
  return normalizePolicy(row?.value);
}

export type Period = { start: Date; end: Date };

/** 그달의 정산일 0시 — 그달에 없는 날(예: 2월 30일)은 그달 말일 */
function payDatesOfMonth(p: SettlementPolicy, y: number, m: number): Date[] {
  const dim = new Date(y, m + 1, 0).getDate();
  return [...new Set(p.payDays.map((d) => Math.min(d, dim)))].sort((a, b) => a - b).map((d) => new Date(y, m, d));
}

/** date 앞뒤 몇 달의 정산일 — 오래된 것부터 */
function payDatesAround(p: SettlementPolicy, date: Date, before: number, after: number): Date[] {
  const out: Date[] = [];
  for (let k = -before; k <= after; k++) out.push(...payDatesOfMonth(p, date.getFullYear(), date.getMonth() + k));
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** date가 들어 있는 정산 기간 — [지난 정산일 0시, 다음 정산일 0시). 끝(end)이 곧 그 기간을 보내는 정산일이다 */
export function periodOf(p: SettlementPolicy, date: Date): Period {
  const t = date.getTime();
  const list = payDatesAround(p, date, 2, 2);
  const i = list.findIndex((d) => d.getTime() > t);
  return { start: list[i - 1], end: list[i] };
}

/** 이미 끝난 정산 기간들 — 가장 최근 것부터 count개 */
export function endedPeriods(p: SettlementPolicy, now: Date, count: number): Period[] {
  const out: Period[] = [];
  let cur = periodOf(p, now);
  for (let i = 0; i < count; i++) {
    cur = periodOf(p, new Date(cur.start.getTime() - 1));
    out.push(cur);
  }
  return out;
}

/**
 * 지급 예정일 — 기간이 끝난 뒤(끝 시각 포함) 처음 오는 정산일.
 * 지금 정산일로 만든 정산은 끝이 곧 정산일이다. 정산일을 바꾸기 전에 만든 정산도 그다음 정산일로 보인다.
 */
export function payDueOf(periodEnd: Date, p: SettlementPolicy): Date {
  const t = periodEnd.getTime();
  const list = payDatesAround(p, periodEnd, 0, 2);
  return list.find((d) => d.getTime() >= t) ?? list[list.length - 1];
}

export type SettlementAmounts = { grossAmount: number; feeAmount: number; netAmount: number; cancelKeptAmount: number };

/** 기간 [start, end) 동안 가게마다 받을 돈 */
export async function computeSettlements(db: Db, start: Date, end: Date): Promise<Map<string, SettlementAmounts>> {
  const acc = new Map<string, { gross: number; fee: number; kept: number }>();
  const add = (merchantId: string, amount: number, rate: number, kept: boolean) => {
    const a = acc.get(merchantId) ?? { gross: 0, fee: 0, kept: 0 };
    a.gross += amount;
    a.fee += feeOf(amount, rate);
    if (kept) a.kept += amount;
    acc.set(merchantId, a);
  };

  // ① 가게에서 사용 처리된 이용권
  const used = await db.redemption.findMany({
    where: { status: 'DONE', type: 'VOUCHER', createdAt: { gte: start, lt: end } },
    include: {
      voucher: { include: { order: { include: { items: true } }, product: { select: { commissionRate: true } } } },
      merchant: { select: { id: true, commissionRate: true } },
    },
  });
  for (const r of used) {
    if (!r.voucher) continue;
    const item = r.voucher.order.items.find((i) => i.productId === r.voucher!.productId);
    add(r.merchantId, item?.amount ?? 0, feeRate(r.voucher.product, r.merchant), false);
  }

  // ② 취소하고 남은 돈 — 가게 몫, 수수료만 뗀다. 환불액을 모르는 옛 취소 건은 넣지 않는다
  const cancelled = await db.order.findMany({
    where: { status: 'CANCELLED', cancelledAt: { gte: start, lt: end }, refundAmount: { not: null } },
    include: {
      items: { include: { product: { select: { commissionRate: true, merchant: { select: { id: true, commissionRate: true } } } } } },
    },
  });
  for (const o of cancelled) {
    const kept = (o.paidAmount || o.totalAmount) - (o.refundAmount ?? 0);
    const it = o.items.find((i) => i.product);
    if (kept <= 0 || !it?.product) continue; // 잼 주문 등 가게 상품이 아닌 것은 홀릭잼 몫
    add(it.product.merchant.id, kept, feeRate(it.product, it.product.merchant), true);
  }

  const out = new Map<string, SettlementAmounts>();
  for (const [merchantId, a] of acc) {
    out.set(merchantId, { grossAmount: a.gross, feeAmount: a.fee, netAmount: a.gross - a.fee, cancelKeptAmount: a.kept });
  }
  return out;
}

/**
 * 정산을 만들거나 다시 계산한다.
 *  - 같은 기간 정산이 있으면: '정산 예정'이면 새 숫자로 고치고, 확정·지급된 것은 그대로 둔다(onlyMissing이면 건드리지 않는다).
 *  - 정산일을 바꿔서 앞 정산과 기간이 겹치면: 앞 정산이 끝난 날부터로 잘라 만든다 — 같은 날이 두 번 세지지 않고, 빠지는 날도 없다.
 */
export async function saveSettlements(db: Db, period: Period, opts: { onlyMissing?: boolean } = {}) {
  const full = await computeSettlements(db, period.start, period.end);
  const byStart = new Map<number, Map<string, SettlementAmounts>>([[period.start.getTime(), full]]);
  const result = { created: 0, updated: 0, skipped: 0 };

  for (const [merchantId, amounts] of full) {
    const same = await db.settlement.findUnique({
      where: { merchantId_periodStart_periodEnd: { merchantId, periodStart: period.start, periodEnd: period.end } },
    });
    if (same) {
      if (!opts.onlyMissing && same.status === 'PENDING') {
        await db.settlement.update({ where: { id: same.id }, data: amounts });
        result.updated++;
      } else {
        result.skipped++;
      }
      continue;
    }

    const overlap = await db.settlement.findFirst({
      where: { merchantId, periodStart: { lt: period.end }, periodEnd: { gt: period.start } },
      orderBy: { periodEnd: 'desc' },
    });
    let start = period.start;
    let data = amounts;
    if (overlap) {
      if (overlap.periodEnd >= period.end) {
        result.skipped++;
        continue;
      }
      start = overlap.periodEnd;
      let part = byStart.get(start.getTime());
      if (!part) {
        part = await computeSettlements(db, start, period.end);
        byStart.set(start.getTime(), part);
      }
      const a = part.get(merchantId);
      if (!a || (a.grossAmount === 0 && a.cancelKeptAmount === 0)) {
        result.skipped++;
        continue;
      }
      data = a;
    }
    await db.settlement.create({ data: { merchantId, periodStart: start, periodEnd: period.end, ...data } });
    result.created++;
  }
  return result;
}
