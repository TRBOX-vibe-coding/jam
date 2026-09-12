/** 지역·카테고리 조회 + 내 정보/관심 설정 */
import {
  Body, Controller, Get, Module, Patch, Req, UseGuards,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { langOf, trField } from './i18n.util';

class UpdateInterestsDto {
  @IsOptional() @IsArray() @IsString({ each: true }) regionIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
}

@Controller()
export class CatalogController {
  constructor(private prisma: PrismaService) {}

  @Get('regions')
  regions() {
    return this.prisma.client.region.findMany({
      where: { isOpen: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, city: true, name: true, i18n: true },
    });
  }

  @Get('categories')
  categories() {
    return this.prisma.client.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, emoji: true, i18n: true },
    });
  }

  @Get('me')
  @UseGuards(UserGuard)
  async me(@UserId() userId: string, @Req() req: any) {
    const lang = langOf(req);
    const db = this.prisma.client;
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, nickname: true, provider: true, email: true, createdAt: true,
        interestRegions: { select: { region: { select: { id: true, name: true } } } },
        interestCategories: { select: { category: { select: { id: true, name: true, emoji: true } } } },
      },
    });

    const membership = await db.userMembership.findFirst({
      where: { userId, status: 'ACTIVE', endAt: { gt: new Date() } },
      orderBy: { endAt: 'desc' },
      include: { plan: { select: { code: true, name: true, price: true, i18n: true } } },
    });

    // 이번 달 + 올해 누적 혜택금액: 멤버십 가치를 숫자로 보여주는 핵심 값 (2026-09-12 대표 픽스)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [monthAgg, totalAgg] = await Promise.all([
      db.redemption.aggregate({
        where: { userId, status: 'DONE', createdAt: { gte: monthStart } },
        _sum: { savedAmount: true },
      }),
      db.redemption.aggregate({
        where: { userId, status: 'DONE', createdAt: { gte: yearStart } },
        _sum: { savedAmount: true },
      }),
    ]);

    const savedThisMonth = monthAgg._sum.savedAmount ?? 0;
    const savedTotal = totalAgg._sum.savedAmount ?? 0;
    const recoveryRate =
      membership && membership.plan.price > 0
        ? Math.round((savedTotal / membership.plan.price) * 100)
        : null;
    const savedMultiple =
      membership && membership.plan.price > 0
        ? Math.round((savedTotal / membership.plan.price) * 10) / 10
        : null;

    const ownedMerchant = await db.merchant.findFirst({
      where: { ownerUserId: userId },
      select: { id: true, name: true, status: true },
    });

    return {
      ...user,
      // 무료 회원(FREE)도 membership 객체는 있다 — 혜택 규칙을 붙이려고 만든다.
      // 2026-09-12 대표 확정: 상품 '유료 회원 가격'과 쿠폰 사용은 isPaid 기준. 쿠폰은 started까지 본다.
      membership: membership
        ? {
            planCode: membership.plan.code,
            planName: trField(membership.plan, 'name', lang),
            source: membership.source,
            startAt: membership.startAt,
            endAt: membership.endAt,
            isPaid: membership.plan.price > 0,
            started: membership.startAt <= new Date(),
          }
        : null,
      savings: { thisMonth: savedThisMonth, total: savedTotal, recoveryRate, multiple: savedMultiple, planPrice: membership?.plan.price ?? null },
      ownedMerchant,
    };
  }

  @Patch('me/interests')
  @UseGuards(UserGuard)
  async updateInterests(@UserId() userId: string, @Body() dto: UpdateInterestsDto) {
    const db = this.prisma.client;
    await db.$transaction(async (tx) => {
      if (dto.regionIds) {
        await tx.userInterestRegion.deleteMany({ where: { userId } });
        await tx.userInterestRegion.createMany({
          data: dto.regionIds.map((regionId) => ({ userId, regionId })),
          skipDuplicates: true,
        });
      }
      if (dto.categoryIds) {
        await tx.userInterestCategory.deleteMany({ where: { userId } });
        await tx.userInterestCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({ userId, categoryId })),
          skipDuplicates: true,
        });
      }
    });
    return { ok: true };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [PrismaService],
})
export class CatalogModule {}
