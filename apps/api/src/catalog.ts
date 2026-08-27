/** 지역·카테고리 조회 + 내 정보/관심 설정 */
import {
  Body, Controller, Get, Module, Patch, UseGuards,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';

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
      select: { id: true, code: true, city: true, name: true },
    });
  }

  @Get('categories')
  categories() {
    return this.prisma.client.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, emoji: true },
    });
  }

  @Get('me')
  @UseGuards(UserGuard)
  async me(@UserId() userId: string) {
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
      include: { plan: { select: { code: true, name: true, price: true } } },
    });

    // 이번 달 절약액 + 누적 절약액: 멤버십 가치를 숫자로 보여주는 핵심 값
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [monthAgg, totalAgg] = await Promise.all([
      db.redemption.aggregate({
        where: { userId, status: 'DONE', createdAt: { gte: monthStart } },
        _sum: { savedAmount: true },
      }),
      db.redemption.aggregate({
        where: { userId, status: 'DONE' },
        _sum: { savedAmount: true },
      }),
    ]);

    const savedThisMonth = monthAgg._sum.savedAmount ?? 0;
    const savedTotal = totalAgg._sum.savedAmount ?? 0;
    const recoveryRate =
      membership && membership.plan.price > 0
        ? Math.round((savedTotal / membership.plan.price) * 100)
        : null;

    const ownedMerchant = await db.merchant.findFirst({
      where: { ownerUserId: userId },
      select: { id: true, name: true, status: true },
    });

    return {
      ...user,
      membership: membership
        ? {
            planCode: membership.plan.code,
            planName: membership.plan.name,
            source: membership.source,
            endAt: membership.endAt,
          }
        : null,
      savings: { thisMonth: savedThisMonth, total: savedTotal, recoveryRate },
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
