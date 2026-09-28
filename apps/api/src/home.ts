/**
 * 홈 — 2026-09-19 문서 4-2 대표 확정(무료/유료 회원 홈을 다르게) + 3-6 A(오늘 쓸 게 없는 날은 인기 쿠폰).
 *
 * 무료 회원 홈 맨 위   ① 잼 시작하기 + 예상 절약액  ② 인기 쿠폰(실제로 많이 쓰인 순)  ③ 상품 구매 혜택
 * 유료 회원 홈 맨 위   ① 오늘 사용할 혜택(비는 날은 인기 쿠폰)  ② 만료 예정 잼  ③ 예약·구매 상품
 * 그 아래 기획전·DROP·상품은 둘 다 지금처럼 둔다. ②만료 예정 잼은 앱이 /me 의 잼 목록으로 그린다.
 * 홈에 필요한 것을 한 번에 내려서, 화면이 여러 곳을 따로 부르지 않게 한다.
 */
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule, OptionalUserGuard, UserId } from './auth';
import { benefitSaving } from './savings.util';
import { dayStart } from './bundled-coupons.util';
import { onSaleWhere } from './product-period.util';
import {
  MERCHANT_SCOPE_SELECT, benefitIdsForPlan, memberPriceProductIds, usableBenefitIds,
} from './plan-scope.util';

type Db = PrismaService['client'];
const DAY = 86_400_000;
/** 인기 쿠폰은 최근 이만큼의 실제 사용 횟수로 줄 세운다 */
const POPULAR_DAYS = 30;

const merchantCard = {
  id: true, name: true, thumbnailUrl: true, avgSpendPerPerson: true, i18n: true,
  region: { select: { name: true, i18n: true } },
  category: { select: { emoji: true } },
} as const;

@Controller('home')
export class HomeController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(OptionalUserGuard)
  async home(@UserId() userId: string | undefined) {
    const db = this.prisma.client;
    const now = new Date();
    const usable = await usableBenefitIds(db, userId);

    const ranked = await this.rankedCoupons(db, usable);
    const [bundleProducts, starter, mine] = await Promise.all([
      this.bundleProducts(db, userId),
      this.starter(db, ranked),
      userId ? this.myDay(db, userId, now, usable) : Promise.resolve(null),
    ]);

    return {
      /** 인기 쿠폰 — 최근 30일에 실제로 많이 쓰인 순. 쓴 기록이 없는 쿠폰은 최근 등록 순으로 뒤에 채운다 */
      // 앱은 8장까지 보여준다. 유료 회원은 내 잼으로 쓸 수 있는 것만 골라 보므로 넉넉히 준다
      popularCoupons: ranked.slice(0, 20),
      /** 상품 구매 혜택 — 사면 근처 가게 쿠폰을 같이 받는 상품 */
      bundleProducts,
      /** 잼 시작하기 + 예상 절약액 — 가장 싼 공개 잼으로 인기 쿠폰 몇 곳만 써도 얼마나 아끼는지 */
      starter,
      /** 오늘 사용할 혜택 (로그인했을 때) — 오늘 예약·오늘이 가는 날인 이용권, 오늘 일정에 담은 쿠폰 */
      today: mine?.today ?? null,
      /** 예약·구매 상품 (로그인했을 때) — 다가오는 예약과 아직 안 쓴 이용권 */
      upcoming: mine?.upcoming ?? null,
    };
  }

  /** 쿠폰을 인기 순으로 — 최근 30일 사용 횟수, 같으면 최근 등록 순 */
  private async rankedCoupons(db: Db, usable: Set<string>) {
    const since = new Date(Date.now() - POPULAR_DAYS * DAY);
    const counts = await db.$queryRaw<{ id: string; n: number }[]>`
      SELECT ub."benefitId" AS id, COUNT(*)::int AS n
      FROM "Redemption" r JOIN "UserBenefit" ub ON ub.id = r."userBenefitId"
      WHERE r.type = 'BENEFIT' AND r.status = 'DONE' AND r."createdAt" > ${since}
      GROUP BY ub."benefitId"`;
    const used = new Map(counts.map((c) => [c.id, Number(c.n)]));
    const rows = await db.benefit.findMany({
      where: { isActive: true, approval: 'ACTIVE', merchant: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'desc' },
      include: { merchant: { select: merchantCard } },
    });
    return rows
      .map((b) => ({
        id: b.id,
        title: b.title,
        type: b.type,
        value: b.value,
        freebieName: b.freebieName,
        i18n: (b as any).i18n,
        /** 최근 30일에 실제로 쓰인 횟수 */
        useCount: used.get(b.id) ?? 0,
        /** 1명 기준 예상 절약액 (% 쿠폰은 가게 1인 평균 이용금액 기준, 모르면 null) */
        estimatedSaving: benefitSaving(b, 1, b.merchant.avgSpendPerPerson),
        /** 지금 가진 잼으로 쓸 수 있는지 */
        canUse: usable.has(b.id),
        merchant: {
          id: b.merchant.id, name: b.merchant.name, thumbnailUrl: b.merchant.thumbnailUrl, i18n: (b.merchant as any).i18n,
          region: b.merchant.region, category: b.merchant.category,
        },
      }))
      .sort((a, b) => b.useCount - a.useCount); // 안정 정렬 — 같은 횟수면 최근 등록 순 그대로
  }

  /** 사면 쿠폰을 같이 받는 상품 — 딸린 쿠폰이 많은 순 */
  private async bundleProducts(db: Db, userId: string | undefined) {
    const rules = await db.benefitGrantRule.findMany({
      where: {
        trigger: 'PRODUCT', isActive: true,
        product: { isActive: true, ...onSaleWhere() },
        benefit: { isActive: true, approval: 'ACTIVE', merchant: { status: 'ACTIVE' } },
      },
      orderBy: { sortOrder: 'asc' },
      select: { productId: true, benefitId: true, benefit: { select: { title: true, i18n: true } } },
    });
    const byProduct = new Map<string, { title: string; i18n: unknown }[]>();
    for (const r of rules) {
      if (!r.productId) continue;
      const list = byProduct.get(r.productId) ?? [];
      if (!list.some((x) => x.title === r.benefit.title)) list.push({ title: r.benefit.title, i18n: (r.benefit as any).i18n });
      byProduct.set(r.productId, list);
    }
    if (byProduct.size === 0) return [];
    const products = await db.product.findMany({
      where: { id: { in: [...byProduct.keys()] }, isActive: true, ...onSaleWhere() },
      include: {
        merchant: { select: { name: true, i18n: true, region: { select: { name: true, i18n: true } }, ...MERCHANT_SCOPE_SELECT } },
      },
    });
    const priced = await memberPriceProductIds(db, userId, products);
    return products
      .map((p) => {
        const coupons = byProduct.get(p.id) ?? [];
        return {
          id: p.id, name: p.name, i18n: (p as any).i18n, imageUrl: p.imageUrl, type: p.type,
          basePrice: p.basePrice, memberPrice: p.memberPrice, memberPriceApplies: priced.has(p.id),
          merchant: { name: p.merchant.name, i18n: (p.merchant as any).i18n, region: p.merchant.region },
          couponCount: coupons.length,
          /** 같이 받는 쿠폰 이름 두 개까지 — "서핑 강습 → 쿠폰 1장" 설명용 */
          coupons: coupons.slice(0, 2),
        };
      })
      .sort((a, b) => b.couponCount - a.couponCount)
      .slice(0, 6);
  }

  /** 가장 싼 공개 잼과, 그 잼으로 인기 쿠폰 3곳만 써도 아끼는 금액 */
  private async starter(db: Db, ranked: Awaited<ReturnType<HomeController['rankedCoupons']>>) {
    const plan = await db.membershipPlan.findFirst({
      where: { isActive: true, isPrivate: false, price: { gt: 0 } },
      orderBy: [{ price: 'asc' }, { sortOrder: 'asc' }],
    });
    if (!plan) return null;
    const ids = new Set(await benefitIdsForPlan(db, plan));
    const top = ranked.filter((b) => ids.has(b.id) && b.estimatedSaving != null).slice(0, 3);
    return {
      code: plan.code, name: plan.name, i18n: (plan as any).i18n, price: plan.price, durationDays: plan.durationDays,
      /** 이 잼으로 열리는 쿠폰 수 */
      couponCount: ids.size,
      /** 인기 쿠폰 몇 곳(estCount)만 써도 아끼는 금액 — 1명 기준 */
      estCount: top.length,
      estSaving: top.reduce((s, b) => s + (b.estimatedSaving ?? 0), 0),
    };
  }

  /** 로그인한 손님의 오늘과 앞으로 — 오늘 쓸 것, 다가오는 예약·안 쓴 이용권 */
  private async myDay(db: Db, userId: string, now: Date, usable: Set<string>) {
    const from = dayStart(now);
    const to = new Date(from.getTime() + DAY);
    const productSel = {
      select: {
        id: true, name: true, i18n: true, imageUrl: true, type: true,
        merchant: { select: { id: true, name: true, i18n: true } },
      },
    } as const;

    const [todayResv, todayVisit, trip, nextResv, tickets] = await Promise.all([
      db.reservation.findMany({
        where: { userId, status: 'CONFIRMED', slot: { startAt: { gte: from, lt: to } } },
        include: { product: productSel, slot: { select: { startAt: true } } },
        orderBy: { slot: { startAt: 'asc' } },
      }),
      // 오늘이 가는 날인 이용권 (2026-09-24 대표 확정 3-2 — 가는 날 고르기)
      db.voucher.findMany({
        where: { userId, status: 'ISSUED', visitDate: { gte: from, lt: to }, validTo: { gt: now } },
        include: { product: productSel },
      }),
      db.trip.findUnique({ where: { userId }, include: { items: true } }),
      db.reservation.findMany({
        where: { userId, status: 'CONFIRMED', slot: { startAt: { gte: now } } },
        include: { product: productSel, slot: { select: { startAt: true } } },
        orderBy: { slot: { startAt: 'asc' } },
        take: 6,
      }),
      db.voucher.findMany({
        where: { userId, status: 'ISSUED', reservation: null, validTo: { gt: now } },
        include: { product: productSel },
        orderBy: [{ visitDate: 'asc' }, { createdAt: 'desc' }],
        take: 6,
      }),
    ]);

    // 오늘 일정에 담은 쿠폰 — 여행 첫날이 Day 1
    let plannedIds: string[] = [];
    if (trip) {
      const idx = Math.round((from.getTime() - dayStart(trip.startDate).getTime()) / DAY);
      const days = Math.round((dayStart(trip.endDate).getTime() - dayStart(trip.startDate).getTime()) / DAY) + 1;
      if (idx >= 0 && idx < days) {
        plannedIds = trip.items.filter((i) => i.itemType === 'BENEFIT' && i.dayIndex === idx).map((i) => i.refId);
      }
    }
    const planned = plannedIds.length
      ? await db.benefit.findMany({
          where: { id: { in: plannedIds }, isActive: true },
          include: { merchant: { select: merchantCard } },
        })
      : [];

    const card = (p: { id: string; name: string; imageUrl: string | null; type: string; merchant: { id: string; name: string } }) => ({
      id: p.id, name: p.name, i18n: (p as any).i18n, imageUrl: p.imageUrl, type: p.type,
      merchant: { id: p.merchant.id, name: p.merchant.name, i18n: (p.merchant as any).i18n },
    });

    const upcoming = [
      ...nextResv.map((r) => ({ kind: 'RESERVATION' as const, id: r.id, at: r.slot.startAt, headcount: r.headcount, product: card(r.product) })),
      ...tickets.map((v) => ({ kind: 'TICKET' as const, id: v.id, at: v.visitDate, validTo: v.validTo, headcount: v.headcount, product: card(v.product) })),
    ]
      // 날짜가 있는 것(예약·가는 날)을 가까운 순으로 먼저, 날짜 없는 이용권은 뒤에
      .sort((a, b) => (a.at && b.at ? a.at.getTime() - b.at.getTime() : a.at ? -1 : b.at ? 1 : 0))
      .slice(0, 5);

    return {
      today: {
        items: [
          ...todayResv.map((r) => ({ kind: 'RESERVATION' as const, id: r.id, at: r.slot.startAt, headcount: r.headcount, product: card(r.product) })),
          ...todayVisit.map((v) => ({ kind: 'TICKET' as const, id: v.id, at: null, headcount: v.headcount, product: card(v.product) })),
        ],
        coupons: planned.map((b) => ({
          id: b.id, title: b.title, type: b.type, value: b.value, freebieName: b.freebieName, i18n: (b as any).i18n,
          canUse: usable.has(b.id),
          merchant: {
            id: b.merchant.id, name: b.merchant.name, thumbnailUrl: b.merchant.thumbnailUrl, i18n: (b.merchant as any).i18n,
            region: b.merchant.region, category: b.merchant.category,
          },
        })),
      },
      upcoming,
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [HomeController],
  providers: [PrismaService],
})
export class HomeModule {}
