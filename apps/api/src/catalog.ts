/** 지역·카테고리 조회 + 내 정보/관심 설정 */
import {
  BadRequestException, Body, Controller, Get, Module, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { langOf, trField } from './i18n.util';

class UpdateInterestsDto {
  @IsOptional() @IsArray() @IsString({ each: true }) regionIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
}

/** 단체 코드 — 기관마다 다른 잼을 쓰므로 코드로 소속을 확인한다 (2026-09-18) */
class OrgCodeDto {
  @IsString() @MinLength(2) @MaxLength(32) code!: string;
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

  /**
   * 단체 코드 입력 — 맞으면 그 단체 전용 잼이 멤버십 목록에 보이고 살 수 있다.
   * 회사가 비용을 대는 경우에는 그 잼 가격을 0원으로 두면 바로 받는 셈이 된다.
   */
  @Post('me/org-code')
  @UseGuards(UserGuard)
  async setOrgCode(@UserId() userId: string, @Body() dto: OrgCodeDto) {
    const db = this.prisma.client;
    const code = dto.code.trim().toUpperCase();
    const plan = await db.membershipPlan.findFirst({
      where: { orgCode: code, isPrivate: true, isActive: true },
      select: { name: true },
    });
    if (!plan) throw new BadRequestException('단체 코드를 찾을 수 없어요. 다시 확인해 주세요.');
    await db.user.update({ where: { id: userId }, data: { orgCode: code } });
    return { ok: true, planName: plan.name };
  }

  @Get('me')
  @UseGuards(UserGuard)
  async me(@UserId() userId: string, @Req() req: any) {
    const lang = langOf(req);
    const db = this.prisma.client;
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, nickname: true, provider: true, email: true, createdAt: true, orgCode: true,
        interestRegions: { select: { region: { select: { id: true, name: true } } } },
        interestCategories: { select: { category: { select: { id: true, name: true, emoji: true } } } },
      },
    });

    // 잼은 겹쳐 둘 수 있다. 화면 호환을 위해 대표 잼 하나(membership)와 전체 목록(memberships)을 함께 준다.
    const allMemberships = await db.userMembership.findMany({
      where: { userId, status: 'ACTIVE', endAt: { gt: new Date() } },
      orderBy: [{ endAt: 'desc' }],
      include: { plan: { select: { code: true, name: true, price: true, scope: true, i18n: true } } },
    });
    // 유료 잼이 있으면 그중 가장 늦게 끝나는 것을 대표로 본다
    const membership = allMemberships.find((m) => m.plan.price > 0) ?? allMemberships[0] ?? null;
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
      /** 지금 가진 잼 전부 — 겹쳐 두면 합쳐서 쓴다 (2026-09-18 대표 확정) */
      memberships: allMemberships.map((m) => ({
        planCode: m.plan.code,
        planName: trField(m.plan, 'name', lang),
        startAt: m.startAt,
        endAt: m.endAt,
        isPaid: m.plan.price > 0,
        started: m.startAt <= new Date(),
        scope: m.plan.scope,
      })),
      /** 단체 코드 — 입력하면 그 단체 전용 잼을 살 수 있다 */
      orgCode: user.orgCode ?? null,
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
