/**
 * 할인 쿠폰 목록 — 가맹점별로 묶어서 돌려준다.
 *
 * 2026-09-18 대표 확정:
 *  - 보는 건 누구나 전부. 무료 회원도 담고 일정에 넣는다.
 *  - 쓰는 건 갈린다. 무료 회원은 못 쓰고, 잼 회원은 자기 잼에 든 쿠폰만 쓴다.
 *    (잼마다 성격이 있다 — plan-scope.util.ts)
 *  - 잼을 여러 개 가지면 합쳐서 쓴다.
 * 2026-09-12 확정(유지):
 *  - 결제 상품에 묶여 받은 쿠폰은 무료 회원도 쓴다. 이게 유일한 예외다.
 *    현장에서 이용권을 써야 열리는 쿠폰은 잠긴 채로 담겨 있다(PENDING).
 *
 * MY의 '내 쿠폰' 화면은 ?source=PRODUCT 로 결제해서 받은 쿠폰만 가져간다.
 */
import { Controller, Get, Module, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { usableBenefitIds } from './plan-scope.util';

@Controller('me/benefits')
export class BenefitsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(UserGuard)
  async list(@UserId() userId: string, @Query('source') source?: string) {
    const db = this.prisma.client;
    const now = new Date();

    // 내 잼으로 지금 쓸 수 있는 쿠폰 (유료 잼 중 이미 시작된 것들의 합집합)
    const usable = await usableBenefitIds(db, userId);

    // 결제 상품에 묶여 받은 쿠폰 — 무료 회원도 쓰는 유일한 예외
    const granted = await db.userBenefit.findMany({
      where: {
        userId,
        sourceType: 'PRODUCT',
        status: { in: ['ACTIVE', 'PENDING'] },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      select: { id: true, benefitId: true, status: true, validFrom: true, validTo: true, sourceId: true },
    });
    const grantedByBenefit = new Map(granted.map((g) => [g.benefitId, g]));

    const productIds = [...new Set(granted.map((g) => g.sourceId).filter(Boolean) as string[])];
    const products = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, i18n: true } })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    const benefits = await db.benefit.findMany({
      where: {
        isActive: true,
        approval: 'ACTIVE',
        merchant: { status: 'ACTIVE' },
        ...(source === 'PRODUCT' ? { id: { in: granted.map((g) => g.benefitId) } } : {}),
      },
      include: {
        merchant: {
          select: {
            id: true, name: true, address: true, thumbnailUrl: true, i18n: true,
            avgSpendPerPerson: true,
            region: { select: { name: true, i18n: true } },
            category: { select: { name: true, emoji: true, i18n: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 가맹점 단위로 그룹
    const byMerchant = new Map<string, { merchant: (typeof benefits)[number]['merchant']; items: any[] }>();
    for (const b of benefits) {
      const m = b.merchant;
      if (!byMerchant.has(m.id)) byMerchant.set(m.id, { merchant: m, items: [] });
      const g = grantedByBenefit.get(b.id);
      const fromProduct = g?.sourceId ? productById.get(g.sourceId) ?? null : null;
      // 예약 상품에 딸린 쿠폰은 예약한 날 0시에 열린다 (2026-09-12 통화 결정).
      // 결제할 때 validFrom에 그 날을 적어 두므로, 그 전까지는 받아만 두고 쓰지 못한다.
      const opensAt = g && g.status === 'ACTIVE' && g.validFrom > now ? g.validFrom : null;
      const productOpen = !!g && g.status === 'ACTIVE' && !opensAt;
      byMerchant.get(m.id)!.items.push({
        /** 사용 처리에 쓰는 id — 쿠폰 자체의 id다 */
        id: b.id,
        benefitId: b.id,
        title: b.title,
        type: b.type,
        value: b.value,
        freebieName: b.freebieName,
        companionLimit: b.companionLimit,
        /** 상품으로 받은 쿠폰은 자기 기한이 있다. 잼으로 열린 쿠폰은 잼 기간을 따른다. */
        validTo: g?.validTo ?? null,
        sourceType: g ? 'PRODUCT' : 'MEMBERSHIP_PLAN',
        status: g?.status ?? 'ACTIVE',
        /** 상품으로 받아 열린 쿠폰이거나, 내 잼에 든 쿠폰이면 쓸 수 있다 (둘 중 하나면 된다) */
        canUse: productOpen || usable.has(b.id),
        /** 결제는 했지만 아직 안 열린 쿠폰 — 현장에서 이용권을 쓰면 열린다 */
        pending: g?.status === 'PENDING',
        /** 예약한 날 0시에 열리는 쿠폰 — 그 시각 (아직 전이면) */
        opensAt,
        fromProduct: fromProduct ? { id: fromProduct.id, name: fromProduct.name, i18n: (fromProduct as any).i18n } : null,
        i18n: (b as any).i18n,
      });
    }

    const rows = [...byMerchant.values()].flatMap((g) => g.items);
    return {
      totalCount: rows.length,
      /** 지금 쓸 수 있는 쿠폰 수 */
      usableCount: rows.filter((r) => r.canUse).length,
      /** 결제해서 받은 쿠폰 수 (MY 뱃지용) */
      grantedCount: rows.filter((r) => r.sourceType === 'PRODUCT').length,
      /** 그중 지금 바로 쓸 수 있는 수 */
      openCount: rows.filter((r) => r.sourceType === 'PRODUCT' && r.status === 'ACTIVE' && !r.opensAt).length,
      /** 이용권을 써야 열리는 수 */
      pendingCount: rows.filter((r) => r.pending).length,
      /** 잼으로 쿠폰을 쓸 수 있는 상태인지 (무료 회원은 false) */
      paidStarted: usable.size > 0,
      merchants: [...byMerchant.values()],
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [BenefitsController],
  providers: [PrismaService],
})
export class BenefitsModule {}
