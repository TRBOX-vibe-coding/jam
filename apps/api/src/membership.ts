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
import { IsString } from 'class-validator';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { addDays, makeOrderNo } from './util';

class PurchaseDto {
  @IsString() planCode!: string;
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
    });
    if (existing) throw new BadRequestException('이미 사용 중인 멤버십이 있습니다');

    const now = new Date();
    const endAt = addDays(now, plan.durationDays);

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
        data: { userId, planId: plan.id, orderId: order.id, startAt: now, endAt },
      });

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
            validTo: rule.validDays ? addDays(now, rule.validDays) : endAt,
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
