/**
 * 내 혜택함 — 가맹점별로 묶어서 돌려준다.
 *
 * 2026-09-12 대표 확정:
 *  - 무료 회원도 쿠폰을 다 보고 담고 일정에 넣는다. [사용하기]만 유료 잼 전용.
 *  - 단 '결제 상품에 묶여 받은 쿠폰'(sourceType=PRODUCT)은 무료 회원도 실제로 쓴다.
 * 그래서 사용 가능 여부(canUse)와 어느 상품으로 받았는지(fromProduct)를 서버가 계산해 준다.
 * MY의 '내 쿠폰' 화면은 ?source=PRODUCT 로 받은 쿠폰만 가져간다.
 */
import { Controller, Get, Module, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';

@Controller('me/benefits')
export class BenefitsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(UserGuard)
  async list(@UserId() userId: string, @Query('source') source?: string) {
    const db = this.prisma.client;
    const now = new Date();

    // 유료 잼이 '시작'되어 일반 쿠폰을 쓸 수 있는 상태인지
    const paidStarted = !!(await db.userMembership.findFirst({
      where: {
        userId, status: 'ACTIVE',
        startAt: { lte: now }, endAt: { gt: now },
        plan: { price: { gt: 0 } },
      },
      select: { id: true },
    }));

    const rows = await db.userBenefit.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        ...(source === 'PRODUCT' ? { sourceType: 'PRODUCT' as const } : {}),
        OR: [{ validTo: null }, { validTo: { gt: now } }],
        benefit: { isActive: true, merchant: { status: 'ACTIVE' } },
      },
      include: {
        benefit: {
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
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 같은 쿠폰이 FREE 플랜과 상품 결제 양쪽에서 열려 있을 수 있다.
    // 목록에 두 번 뜨면 헷갈리므로 '쓸 수 있는 쪽'(상품 결제분)만 남긴다.
    const bestByBenefit = new Map<string, (typeof rows)[number]>();
    for (const ub of rows) {
      const prev = bestByBenefit.get(ub.benefitId);
      if (!prev || (ub.sourceType === 'PRODUCT' && prev.sourceType !== 'PRODUCT')) {
        bestByBenefit.set(ub.benefitId, ub);
      }
    }
    const unique = [...bestByBenefit.values()];

    // 상품 결제로 받은 쿠폰은 '어느 상품에서 왔는지' 같이 보여준다
    const productIds = [...new Set(unique.filter((r) => r.sourceType === 'PRODUCT' && r.sourceId).map((r) => r.sourceId!))];
    const products = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, i18n: true } })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    // 가맹점 단위로 그룹
    const byMerchant = new Map<string, { merchant: (typeof rows)[number]['benefit']['merchant']; items: any[] }>();
    for (const ub of unique) {
      const m = ub.benefit.merchant;
      if (!byMerchant.has(m.id)) byMerchant.set(m.id, { merchant: m, items: [] });
      const fromProduct = ub.sourceType === 'PRODUCT' && ub.sourceId ? productById.get(ub.sourceId) ?? null : null;
      byMerchant.get(m.id)!.items.push({
        id: ub.id,
        benefitId: ub.benefitId,
        title: ub.benefit.title,
        type: ub.benefit.type,
        value: ub.benefit.value,
        freebieName: ub.benefit.freebieName,
        companionLimit: ub.benefit.companionLimit,
        validTo: ub.validTo,
        sourceType: ub.sourceType,
        /** 결제 상품에 묶여 받은 쿠폰이면 무료 회원도 쓸 수 있다 */
        canUse: ub.sourceType === 'PRODUCT' ? true : paidStarted,
        fromProduct: fromProduct ? { id: fromProduct.id, name: fromProduct.name, i18n: (fromProduct as any).i18n } : null,
        i18n: (ub.benefit as any).i18n,
      });
    }

    return {
      totalCount: unique.length,
      /** 결제로 받아서 지금 쓸 수 있는 쿠폰 수 (MY 뱃지용) */
      grantedCount: unique.filter((r) => r.sourceType === 'PRODUCT').length,
      paidStarted,
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
