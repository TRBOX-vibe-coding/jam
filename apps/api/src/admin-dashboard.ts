/**
 * 본사 대시보드 12개 항목 — 2026-09-19 문서 4-6 (대표 요청).
 *
 *   ① 오늘·이번 주·이번 달 거래액          ② 잼별 가입·구매·전환율        ③ 상품별 판매량·매출
 *   ④ 쿠폰별 실제 사용 횟수                 ⑤ 가맹점별 사용 실적           ⑥ 결제 실패·환불·취소
 *   ⑦ 품절 임박 (티켓·DROP·예약 정원)      ⑧ 승인 대기 (가맹점·쿠폰·상품·DROP)
 *   ⑨ 정산 보류 (2-2 B)                     ⑩ 번역이 빠진 것 (가게·쿠폰·상품)
 *   ⑪ 판매·이용 기간이 끝나가는 상품        ⑫ 어제·지난주보다 늘고 줄어든 것
 *
 * 비교는 같은 시각끼리 한다 — 오늘 오후 3시면 어제 오후 3시까지와, 이번 주 목요일 3시면 지난주 목요일 3시까지와.
 * 결제 실패는 토스를 붙여야 쌓인다(지금은 연습 결제라 실패가 없다). 취소·환불은 '주문·취소'에서 기록한 것이다.
 */
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AdminGuard, AuthModule } from './auth';
import { dayKey } from './bundled-coupons.util';

const DAY = 86_400_000;
/** 품절 임박 — 남은 수가 이 이하이거나 전체의 10% 이하 */
const LOW_LEFT = 3;
/** 기간이 끝나가는 상품 — 이 날 수 안에 끝나면 */
const ENDING_DAYS = 7;

type Range = { from: Date; to: Date };

@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class AdminDashboardController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async dashboard() {
    const db = this.prisma.client;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    // 이번 주는 월요일부터
    const week = new Date(today); week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
    const month = new Date(today); month.setDate(1);
    const lastMonth = new Date(month); lastMonth.setMonth(lastMonth.getMonth() - 1);
    // 지난달 같은 날 같은 시각 (지난달이 짧으면 그 달 끝까지)
    const lastMonthNow = new Date(Math.min(new Date(now).setMonth(now.getMonth() - 1), month.getTime()));

    const R = {
      today: { from: today, to: now },
      yesterday: { from: new Date(today.getTime() - DAY), to: new Date(now.getTime() - DAY) },
      week: { from: week, to: now },
      lastWeek: { from: new Date(week.getTime() - 7 * DAY), to: new Date(now.getTime() - 7 * DAY) },
      month: { from: month, to: now },
      lastMonth: { from: lastMonth, to: lastMonthNow },
    };

    // ① 거래액 · ⑫ 비교 — 결제된 주문(취소된 주문은 빠진다)
    const gmv = async (r: Range) => {
      const a = await db.order.aggregate({
        where: { status: 'PAID', paidAt: { gte: r.from, lt: r.to } },
        _sum: { paidAmount: true }, _count: true,
      });
      return { amount: a._sum.paidAmount ?? 0, count: a._count };
    };
    const used = (r: Range) => db.redemption.count({ where: { status: 'DONE', createdAt: { gte: r.from, lt: r.to } } });
    const joined = (r: Range) => db.user.count({ where: { createdAt: { gte: r.from, lt: r.to } } });
    const jams = (r: Range) =>
      db.userMembership.count({ where: { createdAt: { gte: r.from, lt: r.to }, source: 'PURCHASE', plan: { price: { gt: 0 } } } });

    const [gToday, gYest, gWeek, gLastWeek, gMonth, gLastMonth] = await Promise.all([
      gmv(R.today), gmv(R.yesterday), gmv(R.week), gmv(R.lastWeek), gmv(R.month), gmv(R.lastMonth),
    ]);
    const pair = async (f: (r: Range) => Promise<number>) => ({
      today: await f(R.today), yesterday: await f(R.yesterday), week: await f(R.week), lastWeek: await f(R.lastWeek),
    });
    const [usedP, joinedP, jamsP] = await Promise.all([pair(used), pair(joined), pair(jams)]);

    return {
      generatedAt: now,
      gmv: {
        today: gToday, yesterday: gYest, week: gWeek, lastWeek: gLastWeek, month: gMonth, lastMonth: gLastMonth,
      },
      compare: [
        { label: '거래액', unit: '원', today: gToday.amount, yesterday: gYest.amount, week: gWeek.amount, lastWeek: gLastWeek.amount },
        { label: '주문', unit: '건', today: gToday.count, yesterday: gYest.count, week: gWeek.count, lastWeek: gLastWeek.count },
        { label: '현장 사용', unit: '건', ...usedP },
        { label: '새 회원', unit: '명', ...joinedP },
        { label: '잼 구매', unit: '건', ...jamsP },
      ],
      plans: await this.plans(db, R.month, now),
      products: await this.products(db, R.month),
      coupons: await this.coupons(db, R.month),
      merchants: await this.merchants(db, R.month),
      payments: await this.payments(db, R.month),
      lowStock: await this.lowStock(db, now),
      pending: await this.pending(db),
      holds: await db.settlement.findMany({
        where: { heldAt: { not: null } },
        orderBy: { heldAt: 'desc' },
        select: {
          id: true, periodStart: true, periodEnd: true, netAmount: true, heldAt: true, holdReason: true,
          merchant: { select: { name: true } },
        },
      }),
      translations: await this.translations(db),
      ending: await this.ending(db, now),
    };
  }

  /** ② 잼별 — 지금 이용 중, 이번 달 구매·금액, 잼 화면을 본 사람 중 산 비율 */
  private async plans(db: PrismaService['client'], month: Range, now: Date) {
    const plans = await db.membershipPlan.findMany({
      where: { price: { gt: 0 } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, price: true, isActive: true, isPrivate: true },
    });
    const out = [];
    for (const p of plans) {
      const [active, bought, views] = await Promise.all([
        db.userMembership.count({ where: { planId: p.id, status: 'ACTIVE', endAt: { gt: now } } }),
        db.userMembership.findMany({
          where: { planId: p.id, source: 'PURCHASE', createdAt: { gte: month.from, lt: month.to } },
          select: { userId: true, order: { select: { paidAmount: true, status: true } } },
        }),
        db.eventLog.findMany({
          where: { event: 'plan_view', entityId: p.code, createdAt: { gte: month.from, lt: month.to } },
          select: { userId: true, anonId: true },
        }),
      ]);
      const paid = bought.filter((b) => b.order?.status !== 'CANCELLED');
      const viewers = new Set(views.map((v) => v.userId ?? v.anonId ?? '')).size;
      out.push({
        id: p.id, name: p.name, price: p.price, isActive: p.isActive, isPrivate: p.isPrivate,
        /** 지금 이용 중인 회원 (시작 전 포함) */
        active,
        /** 이번 달 구매 건수·금액 */
        bought: paid.length,
        amount: paid.reduce((s, b) => s + (b.order?.paidAmount ?? p.price), 0),
        /** 이번 달 잼 화면을 본 사람 */
        viewers,
        /** 본 사람 중 산 비율(%) — 본 사람이 없으면 null */
        conversion: viewers > 0 ? Math.round((new Set(paid.map((b) => b.userId)).size / viewers) * 1000) / 10 : null,
      });
    }
    return out;
  }

  /** ③ 상품별 — 이번 달 판매량(인원 포함)·매출, 많이 판 순 10개 */
  private async products(db: PrismaService['client'], month: Range) {
    const rows = await db.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { not: null }, order: { status: 'PAID', paidAt: { gte: month.from, lt: month.to } } },
      _sum: { qty: true, amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });
    const ps = await db.product.findMany({
      where: { id: { in: rows.map((r) => r.productId!) } },
      select: { id: true, name: true, type: true, merchant: { select: { name: true } } },
    });
    const byId = new Map(ps.map((p) => [p.id, p]));
    return rows.map((r) => ({
      id: r.productId, name: byId.get(r.productId!)?.name ?? '(지운 상품)', type: byId.get(r.productId!)?.type ?? '',
      merchant: byId.get(r.productId!)?.merchant.name ?? '', orders: r._count, qty: r._sum.qty ?? 0, amount: r._sum.amount ?? 0,
    }));
  }

  /** ④ 쿠폰별 — 이번 달 실제 사용 횟수·손님 절약액, 많이 쓴 순 10개 */
  private async coupons(db: PrismaService['client'], month: Range) {
    const rows = await db.$queryRaw<{ id: string; n: number; saved: number }[]>`
      SELECT ub."benefitId" AS id, COUNT(*)::int AS n, COALESCE(SUM(r."savedAmount"), 0)::int AS saved
      FROM "Redemption" r JOIN "UserBenefit" ub ON ub.id = r."userBenefitId"
      WHERE r.type = 'BENEFIT' AND r.status = 'DONE' AND r."createdAt" >= ${month.from} AND r."createdAt" < ${month.to}
      GROUP BY ub."benefitId" ORDER BY n DESC LIMIT 10`;
    const bs = await db.benefit.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, title: true, merchant: { select: { name: true } } },
    });
    const byId = new Map(bs.map((b) => [b.id, b]));
    return rows.map((r) => ({
      id: r.id, title: byId.get(r.id)?.title ?? '(지운 쿠폰)', merchant: byId.get(r.id)?.merchant.name ?? '',
      uses: Number(r.n), saved: Number(r.saved),
    }));
  }

  /** ⑤ 가맹점별 — 이번 달 쿠폰·딜·이용권 사용 건수와 손님 절약액, 많은 순 10곳 */
  private async merchants(db: PrismaService['client'], month: Range) {
    const rows = await db.redemption.groupBy({
      by: ['merchantId', 'type'],
      where: { status: 'DONE', createdAt: { gte: month.from, lt: month.to } },
      _count: true,
      _sum: { savedAmount: true },
    });
    const agg = new Map<string, { coupon: number; deal: number; voucher: number; saved: number }>();
    for (const r of rows) {
      const a = agg.get(r.merchantId) ?? { coupon: 0, deal: 0, voucher: 0, saved: 0 };
      if (r.type === 'BENEFIT') a.coupon += r._count;
      if (r.type === 'DROP') a.deal += r._count;
      if (r.type === 'VOUCHER') a.voucher += r._count;
      a.saved += r._sum.savedAmount ?? 0;
      agg.set(r.merchantId, a);
    }
    const ms = await db.merchant.findMany({ where: { id: { in: [...agg.keys()] } }, select: { id: true, name: true } });
    const name = new Map(ms.map((m) => [m.id, m.name]));
    return [...agg.entries()]
      .map(([id, a]) => ({ id, name: name.get(id) ?? '', ...a, total: a.coupon + a.deal + a.voucher }))
      .sort((x, y) => y.total - x.total)
      .slice(0, 10);
  }

  /** ⑥ 결제 실패·환불·취소 — 이번 달 */
  private async payments(db: PrismaService['client'], month: Range) {
    const [failed, cancelled] = await Promise.all([
      db.payment.count({ where: { status: 'FAILED', createdAt: { gte: month.from, lt: month.to } } }),
      db.order.aggregate({
        where: { status: 'CANCELLED', cancelledAt: { gte: month.from, lt: month.to } },
        _count: true, _sum: { refundAmount: true, paidAmount: true },
      }),
    ]);
    return {
      failed,
      /** 연습 결제 중에는 실패가 쌓이지 않는다 — 토스를 붙이면 센다 */
      failedTracked: false,
      cancelled: cancelled._count,
      refunded: cancelled._sum.refundAmount ?? 0,
      cancelledPaid: cancelled._sum.paidAmount ?? 0,
    };
  }

  /** ⑦ 품절 임박 — 티켓 남은 수량, DROP 남은 수량, 7일 안 예약 회차의 남은 자리 */
  private async lowStock(db: PrismaService['client'], now: Date) {
    const low = (left: number, total: number) => left > 0 && (left <= LOW_LEFT || left <= total * 0.1);
    const [tickets, drops, slots] = await Promise.all([
      db.product.findMany({
        where: { isActive: true, totalQty: { not: null } },
        select: { id: true, name: true, totalQty: true, soldQty: true, merchant: { select: { name: true } } },
      }),
      db.drop.findMany({
        where: { status: 'OPEN', closeAt: { gt: now } },
        select: { id: true, title: true, totalQty: true, remainingQty: true, merchant: { select: { name: true } } },
      }),
      db.productSlot.findMany({
        where: { isOpen: true, startAt: { gt: now, lt: new Date(now.getTime() + 7 * DAY) }, product: { isActive: true } },
        select: { id: true, startAt: true, capacity: true, reserved: true, product: { select: { name: true, merchant: { select: { name: true } } } } },
        orderBy: { startAt: 'asc' },
      }),
    ]);
    return [
      ...tickets
        .filter((p) => low(p.totalQty! - p.soldQty, p.totalQty!))
        .map((p) => ({ kind: '티켓', id: p.id, name: p.name, merchant: p.merchant.name, left: p.totalQty! - p.soldQty, total: p.totalQty!, at: null as Date | null })),
      ...drops
        .filter((d) => low(d.remainingQty, d.totalQty))
        .map((d) => ({ kind: 'DROP', id: d.id, name: d.title, merchant: d.merchant.name, left: d.remainingQty, total: d.totalQty, at: null as Date | null })),
      ...slots
        .filter((s) => low(s.capacity - s.reserved, s.capacity))
        .map((s) => ({ kind: '예약', id: s.id, name: s.product.name, merchant: s.product.merchant.name, left: s.capacity - s.reserved, total: s.capacity, at: s.startAt as Date | null })),
    ]
      .sort((a, b) => a.left - b.left)
      .slice(0, 12);
  }

  /** ⑧ 승인 대기 — 가맹점·쿠폰·상품·DROP */
  private async pending(db: PrismaService['client']) {
    const [merchants, benefits, products, drops] = await Promise.all([
      db.merchant.count({ where: { status: 'PENDING' } }),
      db.benefit.count({ where: { approval: 'PENDING' } }),
      db.product.count({ where: { approval: 'PENDING' } }),
      db.drop.count({ where: { status: 'PENDING', kind: 'DEAL' } }),
    ]);
    return { merchants, benefits, products, drops, total: merchants + benefits + products + drops };
  }

  /** ⑩ 번역이 빠진 것 — 판매·운영 중인 가게·쿠폰·상품 중 영어·중국어·일본어 이름이 하나라도 없는 것 */
  private async translations(db: PrismaService['client']) {
    const missing = (rows: { i18n: unknown }[], field: string) =>
      rows.filter((r) => {
        const i = (r.i18n ?? {}) as Record<string, Record<string, string> | undefined>;
        return ['en', 'zh', 'ja'].some((l) => !i[l]?.[field]?.trim());
      }).length;
    const [ms, bs, ps] = await Promise.all([
      db.merchant.findMany({ where: { status: 'ACTIVE' }, select: { i18n: true } }),
      db.benefit.findMany({ where: { isActive: true, approval: 'ACTIVE' }, select: { i18n: true } }),
      db.product.findMany({ where: { isActive: true }, select: { i18n: true } }),
    ]);
    const merchants = missing(ms, 'name');
    const benefits = missing(bs, 'title');
    const products = missing(ps, 'name');
    return { merchants, benefits, products, total: merchants + benefits + products, of: ms.length + bs.length + ps.length };
  }

  /** ⑪ 판매·이용 기간이 7일 안에 끝나는 상품 */
  private async ending(db: PrismaService['client'], now: Date) {
    const soon = new Date(now.getTime() + ENDING_DAYS * DAY);
    const yesterday = new Date(now.getTime() - DAY);
    const rows = await db.product.findMany({
      where: {
        isActive: true,
        OR: [
          { saleTo: { gt: yesterday, lte: soon } },
          { useTo: { gt: yesterday, lte: soon } },
        ],
      },
      select: { id: true, name: true, type: true, saleTo: true, useTo: true, merchant: { select: { name: true } } },
    });
    return rows
      .map((p) => ({
        id: p.id, name: p.name, merchant: p.merchant.name,
        saleTo: p.saleTo && p.saleTo > yesterday && p.saleTo <= soon ? dayKey(p.saleTo) : null,
        useTo: p.useTo && p.useTo > yesterday && p.useTo <= soon ? dayKey(p.useTo) : null,
      }))
      .sort((a, b) => ((a.saleTo ?? a.useTo ?? '') < (b.saleTo ?? b.useTo ?? '') ? -1 : 1));
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminDashboardController],
  providers: [PrismaService],
})
export class AdminDashboardModule {}
