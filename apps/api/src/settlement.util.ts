/**
 * 정산 — 주기(기간)와 계산.
 *
 * 주기 — 2026-09-29 사용자 결정: "정산 날짜는 PG(토스)를 붙일 때 홀릭잼 대표가 정한 날짜로, 바꿀 수도 있게.
 *   우리는 시스템으로 정산 날짜를 정하게 해 주면 된다."
 *   본사가 설정에서 주기(한 달에 한 번 · 두 번 · 매주)와 지급일(기간이 끝나고 며칠 뒤)을 정하면,
 *   기간이 끝날 때마다 정산이 저절로 만들어진다(settlement-auto.ts). 가게 정산 화면에는 지금 주기와 지급 예정일이 보인다.
 *   주기를 바꿀 때 가게에 알리는 것은 홀릭잼 본사 몫이다.
 * 계산 — 2026-09-29 대표 확정: ① 가게에서 사용 처리된 이용권의 판매액 ② 취소하고 돌려주지 않은 돈(가게 몫). 수수료만 뗀다.
 */
import { PrismaService } from './prisma.service';
import { feeOf, feeRate } from './fee.util';

type Db = PrismaService['client'];

export type SettlementCycle = 'MONTHLY' | 'SEMI_MONTHLY' | 'WEEKLY';
export type SettlementPolicy = { cycle: SettlementCycle; payDelayDays: number };

export const SETTLEMENT_POLICY_KEY = 'settlementPolicy';
export const DEFAULT_SETTLEMENT_POLICY: SettlementPolicy = { cycle: 'SEMI_MONTHLY', payDelayDays: 5 };

export const CYCLE_LABEL: Record<SettlementCycle, string> = {
  MONTHLY: '한 달에 한 번 (1일~말일)',
  SEMI_MONTHLY: '한 달에 두 번 (1~15일 · 16일~말일)',
  WEEKLY: '일주일에 한 번 (월요일~일요일)',
};

export const policyLabel = (p: SettlementPolicy) => `${CYCLE_LABEL[p.cycle]} · 기간이 끝나고 ${p.payDelayDays}일 뒤 지급`;

export async function getSettlementPolicy(db: Db): Promise<SettlementPolicy> {
  const row = await db.setting.findUnique({ where: { key: SETTLEMENT_POLICY_KEY } });
  const saved = (row?.value ?? {}) as Partial<SettlementPolicy>;
  const p = { ...DEFAULT_SETTLEMENT_POLICY, ...saved };
  if (!CYCLE_LABEL[p.cycle]) p.cycle = DEFAULT_SETTLEMENT_POLICY.cycle;
  return p;
}

export type Period = { start: Date; end: Date };

/** date가 들어 있는 정산 기간 — 끝(end)은 다음 기간 첫날 0시 */
export function periodOf(cycle: SettlementCycle, date: Date): Period {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  if (cycle === 'MONTHLY') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  if (cycle === 'SEMI_MONTHLY') {
    return day <= 15
      ? { start: new Date(y, m, 1), end: new Date(y, m, 16) }
      : { start: new Date(y, m, 16), end: new Date(y, m + 1, 1) };
  }
  const back = (date.getDay() + 6) % 7; // 월요일부터 며칠 지났나
  const start = new Date(y, m, day - back);
  return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
}

/** 이미 끝난 정산 기간들 — 가장 최근 것부터 count개 */
export function endedPeriods(cycle: SettlementCycle, now: Date, count: number): Period[] {
  const out: Period[] = [];
  let p = periodOf(cycle, now);
  for (let i = 0; i < count; i++) {
    p = periodOf(cycle, new Date(p.start.getTime() - 1));
    out.push(p);
  }
  return out;
}

/** 지급 예정일 — 기간 마지막 날에서 payDelayDays일 뒤 (예: 9월 1~15일, 5일 뒤 → 9월 20일) */
export function payDueOf(periodEnd: Date, policy: SettlementPolicy): Date {
  return new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate() - 1 + policy.payDelayDays);
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
 *  - 주기를 바꿔서 앞 정산과 기간이 겹치면: 앞 정산이 끝난 날부터로 잘라 만든다 — 같은 날이 두 번 세지지 않고, 빠지는 날도 없다.
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
