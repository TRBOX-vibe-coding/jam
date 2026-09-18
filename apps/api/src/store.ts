/**
 * 제휴 매장 탐색 — 기존 홀릭잼의 본체(쿠폰북).
 * 비로그인도 모든 제휴처와 혜택을 둘러볼 수 있어야 멤버십을 살 이유가 보인다.
 */
import { Controller, Get, Module, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule, OptionalUserGuard, UserId } from './auth';
import { activePaidPlanIds } from './plan-scope.util';

@Controller('merchants')
export class StoreController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query('regionId') regionId?: string, @Query('categoryId') categoryId?: string) {
    const now = new Date();
    const rows = await this.prisma.client.merchant.findMany({
      where: {
        status: 'ACTIVE',
        ...(regionId ? { regionId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ region: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: {
        region: { select: { id: true, name: true, i18n: true } },
        category: { select: { id: true, name: true, emoji: true, i18n: true } },
        benefits: {
          where: { isActive: true },
          select: {
            id: true, title: true, type: true, value: true,
            freebieName: true, companionLimit: true, conditions: true, i18n: true,
          },
        },
        products: { where: { isActive: true }, select: { id: true } },
        drops: { where: { status: 'OPEN', closeAt: { gt: now } }, select: { id: true } },
      },
    });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      intro: m.intro,
      i18n: (m as any).i18n,
      address: m.address,
      thumbnailUrl: m.thumbnailUrl,
      region: m.region,
      category: m.category,
      benefits: m.benefits,
      productCount: m.products.length,
      openDropCount: m.drops.length,
    }));
  }

  @Get(':id')
  @UseGuards(OptionalUserGuard)
  async detail(@UserId() userId: string | undefined, @Param('id') id: string) {
    const now = new Date();
    const db = this.prisma.client;
    const m = await this.prisma.client.merchant.findFirst({
      where: { id, status: 'ACTIVE' },
      include: {
        region: { select: { name: true, i18n: true } },
        category: { select: { name: true, emoji: true, i18n: true } },
        benefits: {
          where: { isActive: true },
          select: {
            id: true, title: true, type: true, value: true,
            freebieName: true, companionLimit: true, maxUsePerDay: true, conditions: true, i18n: true,
          },
        },
        products: {
          where: { isActive: true },
          select: {
            id: true, name: true, type: true, imageUrl: true,
            basePrice: true, memberPrice: true, memberPricePlanIds: true, i18n: true,
          },
        },
        drops: {
          where: { status: 'OPEN', closeAt: { gt: now } },
          select: {
            id: true, title: true, imageUrl: true, kind: true,
            normalPrice: true, dropPrice: true, remainingQty: true, closeAt: true, i18n: true,
          },
        },
      },
    });
    if (!m) throw new NotFoundException('매장을 찾을 수 없습니다');

    // 상품마다 할인 줄 잼이 다르므로 서버가 판단해서 내려준다 (2026-09-18 대표 확정)
    const myPlanIds = await activePaidPlanIds(db, userId);
    return {
      ...m,
      products: m.products.map((p) => ({
        ...p,
        memberPriceApplies:
          p.memberPrice != null &&
          myPlanIds.length > 0 &&
          (p.memberPricePlanIds.length === 0 || p.memberPricePlanIds.some((id) => myPlanIds.includes(id))),
      })),
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [StoreController],
  providers: [PrismaService],
})
export class StoreModule {}
