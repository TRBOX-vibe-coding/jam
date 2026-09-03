/**
 * 상품 · 주문 · 이용권 · 예약.
 *  - RESERVATION 상품은 날짜·시간·인원 선택 → 결제 → 예약확정까지 앱 안에서 끝난다.
 *    (기존 서비스의 "결제 후 전화 예약" 단절을 없애는 부분)
 *  - PASS 상품은 결제 즉시 연결된 지역 혜택이 자동으로 열린다 (부산 바다 PASS 방식).
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AuthModule, OptionalUserGuard, UserGuard, UserId } from './auth';
import { addDays, makeOrderNo, makeVoucherCode } from './util';

class PurchaseProductDto {
  @IsOptional() @IsString() slotId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) headcount!: number;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
}

@Controller()
export class OrdersController {
  constructor(private prisma: PrismaService) {}

  // ---------------- 상품 ----------------

  @Get('products')
  @UseGuards(OptionalUserGuard)
  async products(@Query('merchantId') merchantId?: string, @Query('type') type?: string) {
    const db = this.prisma.client;
    const rows = await db.product.findMany({
      where: {
        isActive: true,
        ...(merchantId ? { merchantId } : {}),
        ...(type ? { type: type as never } : {}),
      },
      include: {
        merchant: { select: { id: true, name: true, i18n: true, region: { select: { name: true, i18n: true } } } },
        category: { select: { name: true, emoji: true, i18n: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows;
  }

  @Get('products/:id')
  async product(@Param('id') id: string) {
    const db = this.prisma.client;
    const p = await db.product.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, name: true, address: true, i18n: true } },
        slots: {
          where: { isOpen: true, startAt: { gt: new Date() } },
          orderBy: { startAt: 'asc' },
          take: 20,
        },
      },
    });
    if (!p) throw new NotFoundException('상품을 찾을 수 없습니다');
    return {
      ...p,
      slots: p.slots.map((s) => ({ ...s, remaining: s.capacity - s.reserved })),
    };
  }

  // ---------------- 구매 ----------------

  @Post('products/:id/purchase')
  @UseGuards(UserGuard)
  async purchase(@UserId() userId: string, @Param('id') id: string, @Body() dto: PurchaseProductDto) {
    const db = this.prisma.client;
    const now = new Date();
    const product = await db.product.findUnique({ where: { id } });
    if (!product || !product.isActive) throw new NotFoundException('판매 중인 상품이 아닙니다');

    const isMember = !!(await db.userMembership.findFirst({
      where: { userId, status: 'ACTIVE', endAt: { gt: now } },
    }));
    const unitPrice = isMember && product.memberPrice != null ? product.memberPrice : product.basePrice;

    if (product.type === 'RESERVATION' && !dto.slotId) {
      throw new BadRequestException('예약 시간을 선택해 주세요');
    }

    return db.$transaction(async (tx) => {
      let slot = null;
      if (dto.slotId) {
        // 정원 조건부 차감 — 초과 예약 방지
        const updated = await tx.productSlot.updateMany({
          where: {
            id: dto.slotId,
            productId: id,
            isOpen: true,
            startAt: { gt: now },
          },
          data: { reserved: { increment: dto.headcount } },
        });
        if (updated.count === 0) throw new BadRequestException('선택한 회차를 예약할 수 없습니다');
        slot = await tx.productSlot.findUniqueOrThrow({ where: { id: dto.slotId } });
        if (slot.reserved > slot.capacity) {
          throw new BadRequestException('남은 자리가 부족합니다');
        }
      }

      const amount = unitPrice * (product.type === 'RESERVATION' ? dto.headcount : 1);
      const order = await tx.order.create({
        data: {
          userId,
          status: 'PAID',
          orderNo: makeOrderNo(),
          totalAmount: amount,
          paidAmount: amount,
          paidAt: now,
          items: {
            create: {
              type: 'PRODUCT',
              productId: id,
              name: product.name,
              unitPrice,
              qty: product.type === 'RESERVATION' ? dto.headcount : 1,
              amount,
            },
          },
          payments: {
            create: { provider: 'MOCK', status: 'PAID', amount, method: 'mock', paidAt: now },
          },
        },
      });

      const voucher = await tx.voucher.create({
        data: {
          userId,
          orderId: order.id,
          productId: id,
          code: makeVoucherCode(),
          headcount: dto.headcount,
          validTo: slot ? slot.endAt : addDays(now, 30),
          status: slot ? 'RESERVED' : 'ISSUED',
        },
      });

      let reservation = null;
      if (slot) {
        reservation = await tx.reservation.create({
          data: {
            userId,
            productId: id,
            slotId: slot.id,
            voucherId: voucher.id,
            headcount: dto.headcount,
            contactName: dto.contactName ?? '홀릭잼 회원',
            contactPhone: dto.contactPhone ?? '',
            status: 'CONFIRMED',
          },
        });
      }

      // PASS 상품: 연결된 혜택 자동 오픈 (부산 바다 PASS 방식)
      let grantedBenefits = 0;
      const rules = await tx.benefitGrantRule.findMany({
        where: { trigger: 'PRODUCT', productId: id, isActive: true },
      });
      for (const rule of rules) {
        await tx.userBenefit.upsert({
          where: {
            userId_benefitId_sourceType_sourceId: {
              userId, benefitId: rule.benefitId, sourceType: 'PRODUCT', sourceId: order.id,
            },
          },
          update: {},
          create: {
            userId,
            benefitId: rule.benefitId,
            sourceType: 'PRODUCT',
            sourceId: order.id,
            validTo: rule.validDays ? addDays(now, rule.validDays) : addDays(now, 30),
          },
        });
        grantedBenefits++;
      }

      return {
        ok: true,
        orderNo: order.orderNo,
        paidAmount: amount,
        memberApplied: isMember && product.memberPrice != null,
        voucher: { id: voucher.id, code: voucher.code, validTo: voucher.validTo },
        reservation: reservation
          ? { id: reservation.id, startAt: slot!.startAt, headcount: reservation.headcount, status: reservation.status }
          : null,
        grantedBenefits,
        message: reservation
          ? '결제와 예약이 함께 확정되었습니다.'
          : grantedBenefits > 0
            ? `결제 완료! 지역 혜택 ${grantedBenefits}개가 자동으로 열렸습니다.`
            : '결제 완료! 이용권이 발급되었습니다.',
      };
    });
  }

  // ---------------- 내 주문/이용권/예약 ----------------

  @Get('me/orders')
  @UseGuards(UserGuard)
  myOrders(@UserId() userId: string) {
    return this.prisma.client.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: true },
    });
  }

  @Get('me/vouchers')
  @UseGuards(UserGuard)
  async myVouchers(@UserId() userId: string) {
    const rows = await this.prisma.client.voucher.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            name: true, type: true, verification: true, i18n: true,
            merchant: { select: { id: true, name: true, address: true, i18n: true } },
          },
        },
        reservation: { include: { slot: { select: { startAt: true, endAt: true } } } },
      },
    });
    return rows;
  }

  @Get('me/claims')
  @UseGuards(UserGuard)
  myClaims(@UserId() userId: string) {
    return this.prisma.client.dropClaim.findMany({
      where: { userId },
      orderBy: { claimedAt: 'desc' },
      include: {
        drop: {
          select: {
            title: true, kind: true, normalPrice: true, dropPrice: true,
            usableFromMinute: true, usableToMinute: true, i18n: true,
            merchant: { select: { id: true, name: true, address: true, i18n: true } },
          },
        },
      },
    });
  }

  @Get('me/redemptions')
  @UseGuards(UserGuard)
  myRedemptions(@UserId() userId: string) {
    return this.prisma.client.redemption.findMany({
      where: { userId, status: 'DONE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { merchant: { select: { name: true, i18n: true } } },
    });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [PrismaService],
})
export class OrdersModule {}
