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
import { activeAdRanks, clickCounts, rankSort } from './ranking.util';
import { isPaidMember, PRODUCT_COUPON_VALID_DAYS } from './membership.util';

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
    // 상위 노출 — 광고(기간 내 rank) → 클릭수 → 나머지 (2026-09-10 픽스)
    const [clicks, ads] = await Promise.all([
      clickCounts(db, ['product_view', 'product_purchase', 'product_redeem']),
      activeAdRanks(db),
    ]);
    return rankSort(rows, {
      id: (r) => r.id,
      clicks,
      ads,
      adKey: (r) => `PRODUCT:${r.id}`,
    }).map((r) => ({ ...r, isAd: ads.has(`PRODUCT:${r.id}`) }));
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

    // 결제하면 함께 받는 '근처 할인 쿠폰' — 슈퍼 관리자만 연결한다 (2026-09-12 대표 확정).
    // 구매 전에 미리 보여줘 결제를 밀어주고, 결제하면 무료 회원도 실제로 쓸 수 있게 발급된다.
    const links = await db.benefitGrantRule.findMany({
      where: {
        trigger: 'PRODUCT', productId: id, isActive: true,
        benefit: { isActive: true, approval: 'ACTIVE', merchant: { status: 'ACTIVE' } },
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        benefit: {
          include: {
            merchant: {
              select: {
                id: true, name: true, thumbnailUrl: true, i18n: true, avgSpendPerPerson: true,
                region: { select: { name: true, i18n: true } },
                category: { select: { name: true, emoji: true, i18n: true } },
              },
            },
          },
        },
      },
    });
    return {
      ...p,
      // 티켓형 남은 수량 (null=무제한)
      remainingQty: p.totalQty != null ? Math.max(0, p.totalQty - p.soldQty) : null,
      slots: p.slots.map((s) => ({ ...s, remaining: s.capacity - s.reserved })),
      bundledCoupons: links.filter((l, i, a) => a.findIndex((x) => x.benefitId === l.benefitId) === i).map((l) => ({
        benefitId: l.benefitId,
        title: l.benefit.title,
        type: l.benefit.type,
        value: l.benefit.value,
        freebieName: l.benefit.freebieName,
        companionLimit: l.benefit.companionLimit,
        validDays: l.validDays ?? PRODUCT_COUPON_VALID_DAYS,
        merchant: l.benefit.merchant,
        i18n: (l.benefit as any).i18n,
      })),
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

    // 2026-09-12 대표 확정: 상품 '유료 회원 가격'은 유료 잼 보유자만. 무료 회원은 기본 판매가로 산다.
    const isMember = await isPaidMember(db, userId);
    const unitPrice = isMember && product.memberPrice != null ? product.memberPrice : product.basePrice;

    if (product.type === 'RESERVATION' && !dto.slotId) {
      throw new BadRequestException('예약 시간을 선택해 주세요');
    }

    return db.$transaction(async (tx) => {
      // 티켓형 총 수량 제한 — 조건부 증가로 초과 판매 방지, 소진되면 자동 품절
      if (!dto.slotId && product.totalQty != null) {
        const taken = await tx.$executeRaw`
          UPDATE "Product" SET "soldQty" = "soldQty" + 1
          WHERE "id" = ${id} AND "soldQty" < "totalQty"`;
        if (taken === 0) throw new BadRequestException('준비된 수량이 모두 판매되었습니다 (품절)');
        await tx.$executeRaw`
          UPDATE "Product" SET "isActive" = false
          WHERE "id" = ${id} AND "totalQty" IS NOT NULL AND "soldQty" >= "totalQty"`;
      }

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

      // 상품에 묶인 '근처 할인 쿠폰'을 구매자에게 발급한다.
      // 언제부터 열리는지는 상품 설정을 따른다 (2026-09-12 대표 확정):
      //   PURCHASE    결제 즉시
      //   REDEEM      현장에서 이용권을 '사용 처리'하는 순간 (날짜 미정 티켓) — 지금은 담아만 둔다
      //   RESERVATION 예약 확정일 00시
      // 고객이 날짜를 입력하는 화면은 만들지 않는다. 결제·예약·현장 사용이 곧 신호다.
      let grantedBenefits = 0;
      let pendingBenefits = 0;
      const seen = new Set<string>();
      const rules = await tx.benefitGrantRule.findMany({
        where: { trigger: 'PRODUCT', productId: id, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      for (const rule of rules) {
        if (seen.has(rule.benefitId)) continue;
        seen.add(rule.benefitId);
        const days = rule.validDays ?? PRODUCT_COUPON_VALID_DAYS;

        let status: 'ACTIVE' | 'PENDING' = 'ACTIVE';
        let validFrom = now;
        let validTo = addDays(now, days);
        if (product.couponStartMode === 'REDEEM') {
          // 아직 열지 않는다 — 이용권을 쓰는 날이 이 손님의 여행 시작일이다.
          // 이용권이 살아 있는 동안은 사라지지 않게 이용권 기한을 따라간다.
          status = 'PENDING';
          validTo = voucher.validTo;
        } else if (product.couponStartMode === 'RESERVATION' && slot) {
          const day = new Date(slot.startAt);
          day.setHours(0, 0, 0, 0);
          validFrom = day;
          validTo = addDays(day, days);
        }

        await tx.userBenefit.upsert({
          where: {
            userId_benefitId_sourceType_sourceId: {
              userId, benefitId: rule.benefitId, sourceType: 'PRODUCT', sourceId: id,
            },
          },
          update: { status, validFrom, validTo },
          create: {
            userId,
            benefitId: rule.benefitId,
            sourceType: 'PRODUCT',
            sourceId: id,
            status,
            validFrom,
            validTo,
          },
        });
        if (status === 'PENDING') pendingBenefits++; else grantedBenefits++;
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
        /** 아직 열리지 않은 쿠폰 — 현장에서 이용권을 쓰면 열린다 */
        pendingBenefits,
        message: pendingBenefits > 0
          ? `결제 완료! 할인 쿠폰 ${pendingBenefits}장을 담았어요. 현장에서 이용권을 쓰면 바로 열립니다.`
          : reservation
            ? grantedBenefits > 0
              ? `예약이 확정됐어요! 할인 쿠폰 ${grantedBenefits}장은 이용일부터 쓸 수 있어요.`
              : '결제와 예약이 함께 확정되었습니다.'
            : grantedBenefits > 0
              ? `결제 완료! 근처에서 바로 쓸 수 있는 할인 쿠폰 ${grantedBenefits}장을 함께 받았어요.`
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
