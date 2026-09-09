/**
 * 멤버십.
 * 구매 즉시 자격이 열리고, BenefitGrantRule(MEMBERSHIP_PLAN)에 걸린 모든 혜택이
 * UserBenefit으로 자동 생성된다. — "쿠폰을 또 찾아서 받는" 단계가 없다.
 * 결제는 PG 확정 전까지 MOCK으로 기록한다.
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Post, UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { addDays, makeOrderNo } from './util';

class PurchaseDto {
  @IsString() planCode!: string;
  /** 기간잼(3일/5일)의 사용 시작일. 미리 결제해도 이 날 00시부터 개시된다 (2026-09-09 픽스). 없으면 오늘. */
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
}

@Controller('membership')
export class MembershipController {
  constructor(private prisma: PrismaService) {}

  @Get('plans')
  plans() {
    return this.prisma.client.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, description: true, price: true, durationDays: true, i18n: true },
    });
  }

  @Post('purchase')
  @UseGuards(UserGuard)
  async purchase(@UserId() userId: string, @Body() dto: PurchaseDto) {
    const db = this.prisma.client;
    const plan = await db.membershipPlan.findUnique({ where: { code: dto.planCode } });
    if (!plan || !plan.isActive) throw new NotFoundException('판매 중인 멤버십이 아닙니다');

    const existing = await db.userMembership.findFirst({
      where: { userId, status: 'ACTIVE', endAt: { gt: new Date() } },
      include: { plan: { select: { price: true } } },
    });
    // 무료 회원은 언제든 유료로 올라탈 수 있다 — 무료 자격은 종료 처리하고 진행
    if (existing && existing.plan.price === 0) {
      await db.userMembership.update({ where: { id: existing.id }, data: { status: 'EXPIRED', endAt: new Date() } });
    } else if (existing) {
      throw new BadRequestException('이미 사용 중인 멤버십이 있습니다');
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
