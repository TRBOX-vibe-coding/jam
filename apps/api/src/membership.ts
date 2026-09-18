/**
 * 멤버십.
 * 구매 즉시 자격이 열리고, BenefitGrantRule(MEMBERSHIP_PLAN)에 걸린 모든 혜택이
 * UserBenefit으로 자동 생성된다. — "쿠폰을 또 찾아서 받는" 단계가 없다.
 * 결제는 PG 확정 전까지 MOCK으로 기록한다.
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PrismaService } from './prisma.service';
import { AuthModule, OptionalUserGuard, UserGuard, UserId } from './auth';
import { addDays, makeOrderNo } from './util';
import { benefitIdsForPlan } from './plan-scope.util';
import { langOf, trField } from './i18n.util';

class PurchaseDto {
  @IsString() planCode!: string;
  /** 기간잼(3일/5일)의 사용 시작일. 미리 결제해도 이 날 00시부터 개시된다 (2026-09-09 픽스). 없으면 오늘. */
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
}

@Controller('membership')
export class MembershipController {
  constructor(private prisma: PrismaService) {}

  @Get('plans')
  @UseGuards(OptionalUserGuard)
  async plans(@UserId() userId: string | undefined) {
    const db = this.prisma.client;
    // 단체 전용 잼(공무원노조, 공사 임직원 등)은 코드를 가진 회원에게만 보인다
    const me = userId
      ? await db.user.findUnique({ where: { id: userId }, select: { orgCode: true } })
      : null;
    const rows = await db.membershipPlan.findMany({
      where: {
        isActive: true,
        OR: [
          { isPrivate: false },
          ...(me?.orgCode ? [{ isPrivate: true, orgCode: me.orgCode }] : []),
        ],
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, code: true, name: true, description: true, price: true, durationDays: true,
        scope: true, scopeRegionIds: true, scopeCategoryIds: true, isPrivate: true, imageUrl: true, i18n: true,
      },
    });
    return rows;
  }


  /**
   * 잼 하나 — 결제 화면에서 쓴다.
   * 값만 내려주지 않고 "이 잼을 사면 무엇이 열리는지"를 숫자와 예시로 함께 준다.
   */
  @Get('plans/:code')
  @UseGuards(OptionalUserGuard)
  async planDetail(@Param('code') code: string, @UserId() userId: string | undefined, @Req() req: any) {
    const db = this.prisma.client;
    const lang = langOf(req);
    const plan = await db.membershipPlan.findUnique({ where: { code } });
    if (!plan || !plan.isActive) throw new NotFoundException('판매 중인 잼이 아닙니다');
    if (plan.isPrivate) {
      const me = userId ? await db.user.findUnique({ where: { id: userId }, select: { orgCode: true } }) : null;
      if (!me?.orgCode || me.orgCode !== plan.orgCode) {
        throw new NotFoundException('단체 전용 잼이에요. 단체 코드를 먼저 넣어 주세요.');
      }
    }

    const ids = await benefitIdsForPlan(db, plan);
    const rows = await db.benefit.findMany({
      where: { id: { in: ids } },
      take: 4,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, type: true, value: true, i18n: true,
        merchant: {
          select: {
            id: true, name: true, thumbnailUrl: true, i18n: true,
            region: { select: { name: true, i18n: true } },
            category: { select: { emoji: true } },
          },
        },
      },
    });
    const merchantCount = ids.length
      ? (await db.benefit.findMany({ where: { id: { in: ids } }, select: { merchantId: true }, distinct: ['merchantId'] })).length
      : 0;

    // 이미 가지고 있는 잼인지 (결제 화면에서 다시 사게 두면 안 된다)
    const owned = userId
      ? await db.userMembership.findFirst({
          where: { userId, planId: plan.id, status: 'ACTIVE', endAt: { gt: new Date() } },
          select: { startAt: true, endAt: true },
        })
      : null;

    return {
      id: plan.id, code: plan.code,
      name: trField(plan, 'name', lang),
      description: trField(plan, 'description', lang),
      price: plan.price, durationDays: plan.durationDays,
      scope: plan.scope, scopeRegionIds: plan.scopeRegionIds, scopeCategoryIds: plan.scopeCategoryIds,
      isPrivate: plan.isPrivate, imageUrl: plan.imageUrl,
      couponCount: ids.length,
      merchantCount,
      samples: rows.map((b) => ({
        id: b.id, title: trField(b, 'title', lang), type: b.type, value: b.value,
        merchant: {
          name: trField(b.merchant, 'name', lang),
          thumbnailUrl: b.merchant.thumbnailUrl,
          region: trField(b.merchant.region, 'name', lang),
          emoji: b.merchant.category.emoji,
        },
      })),
      owned: owned ? { startAt: owned.startAt, endAt: owned.endAt } : null,
    };
  }

  @Post('purchase')
  @UseGuards(UserGuard)
  async purchase(@UserId() userId: string, @Body() dto: PurchaseDto) {
    const db = this.prisma.client;
    const plan = await db.membershipPlan.findUnique({ where: { code: dto.planCode } });
    if (!plan || !plan.isActive) throw new NotFoundException('판매 중인 멤버십이 아닙니다');

    // 단체 전용 잼은 코드를 가진 회원만 살 수 있다 (2026-09-18 대표 확정)
    if (plan.isPrivate) {
      const me = await db.user.findUnique({ where: { id: userId }, select: { orgCode: true } });
      if (!me?.orgCode || me.orgCode !== plan.orgCode) {
        throw new BadRequestException('단체 전용 잼입니다. MY에서 단체 코드를 먼저 입력해 주세요.');
      }
    }

    // 잼은 겹쳐 둘 수 있다 — 5일잼을 쓰는 중에 잼마스터를 사면 둘 다 살아 있고 합쳐서 쓴다.
    // 무료(FREE) 자격만 정리하고, 같은 잼을 또 사는 것만 막는다.
    const actives = await db.userMembership.findMany({
      where: { userId, status: 'ACTIVE', endAt: { gt: new Date() } },
      include: { plan: { select: { id: true, price: true, name: true } } },
    });
    for (const a of actives) {
      if (a.plan.price === 0) {
        await db.userMembership.update({ where: { id: a.id }, data: { status: 'EXPIRED', endAt: new Date() } });
      } else if (a.plan.id === plan.id) {
        throw new BadRequestException(`이미 이용 중인 ${a.plan.name}이에요. 끝난 뒤에 다시 구매할 수 있어요.`);
      }
    }

    const now = new Date();
    // 기간잼: 여행 시작일 00시부터 개시하고, N일잼은 N박(N+1)일을 커버한다 (3일잼 = 3박4일).
    // 잼마스터(연간)는 즉시 시작.
    const isShortJam = plan.durationDays <= 30;
    let startAt = now;
    if (isShortJam && dto.startDate) {
      const s = new Date(`${dto.startDate}T00:00:00`);
      if (Number.isNaN(s.getTime())) throw new BadRequestException('시작일이 올바르지 않습니다');
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      if (s < todayStart) throw new BadRequestException('시작일은 오늘 이후여야 합니다');
      if (s.getTime() - now.getTime() > 90 * 86_400_000) throw new BadRequestException('시작일은 90일 이내로 선택해 주세요');
      startAt = s;
    }
    const endAt = addDays(startAt, isShortJam ? plan.durationDays + 1 : plan.durationDays);

    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          status: 'PAID',
          orderNo: makeOrderNo(),
          totalAmount: plan.price,
          paidAmount: plan.price,
          paidAt: now,
          items: {
            create: {
              type: 'MEMBERSHIP',
              refId: plan.id,
              name: plan.name,
              unitPrice: plan.price,
              qty: 1,
              amount: plan.price,
            },
          },
          payments: {
            create: { provider: 'MOCK', status: 'PAID', amount: plan.price, method: 'mock', paidAt: now },
          },
        },
      });

      const membership = await tx.userMembership.create({
        data: { userId, planId: plan.id, orderId: order.id, startAt, endAt },
      });

      // 회원 그룹 태그 — 타깃 Push·세그먼트용 (예: plan:JAM3)
      const planTag = `plan:${plan.code}`;
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { tags: true } });
      if (!u.tags.includes(planTag)) {
        await tx.user.update({ where: { id: userId }, data: { tags: { push: planTag } } });
      }

      // 이 플랜으로 열리는 모든 혜택을 즉시 지급
      const rules = await tx.benefitGrantRule.findMany({
        where: { trigger: 'MEMBERSHIP_PLAN', membershipPlanId: plan.id, isActive: true },
      });
      for (const rule of rules) {
        await tx.userBenefit.upsert({
          where: {
            userId_benefitId_sourceType_sourceId: {
              userId,
              benefitId: rule.benefitId,
              sourceType: 'MEMBERSHIP_PLAN',
              sourceId: membership.id,
            },
          },
          update: {},
          create: {
            userId,
            benefitId: rule.benefitId,
            sourceType: 'MEMBERSHIP_PLAN',
            sourceId: membership.id,
            validFrom: now,
            validTo: rule.validDays ? addDays(startAt, rule.validDays) : endAt,
          },
        });
      }

      return { order, membership, grantedCount: rules.length };
    });

    return {
      ok: true,
      orderNo: result.order.orderNo,
      planName: plan.name,
      planCode: plan.code,
      startAt,
      endAt,
      grantedBenefits: result.grantedCount,
      message: `${plan.name} 시작! 제휴 혜택 ${result.grantedCount}개가 내 혜택함에 열렸습니다.`,
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [MembershipController],
  providers: [PrismaService],
})
export class MembershipModule {}
