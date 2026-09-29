/**
 * 상품 · 주문 · 이용권 · 예약.
 *  - RESERVATION 상품은 날짜·시간·인원 선택 → 결제 → 예약확정까지 앱 안에서 끝난다.
 *    (기존 서비스의 "결제 후 전화 예약" 단절을 없애는 부분)
 *  - 티켓·PASS는 결제할 때 '가는 날'을 고를 수 있다(안 골라도 된다). 딸려 받은 쿠폰이 언제 열리는지는
 *    bundled-coupons.util.ts 한 곳에서 정한다 (2026-09-24 대표 확정 3-2).
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { normalizePhone, PHONE_REQUIRED } from './phone.util';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AuthModule, OptionalUserGuard, UserGuard, UserId } from './auth';
import { addDays, makeOrderNo, makeVoucherCode } from './util';
import { activeAdRanks, clickCounts, rankSort } from './ranking.util';
import { PRODUCT_COUPON_VALID_DAYS } from './membership.util';
import { MERCHANT_SCOPE_SELECT, memberPriceProductIds, plansGivingMemberPrice } from './plan-scope.util';
import {
  dayKey, dayLabel, parseDay, syncBundledCoupons, visitDateError, visitDateRange,
} from './bundled-coupons.util';

import { fixedUseDay, onSaleWhere, periodKeys, saleState, voucherWindow } from './product-period.util';

class PurchaseProductDto {
  @IsOptional() @IsString() slotId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) headcount!: number;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  /** 가는 날 'YYYY-MM-DD' — 티켓·PASS만, 안 골라도 된다 (2026-09-24 대표 확정 3-2) */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) visitDate?: string;
}

class VisitDateDto {
  /** 'YYYY-MM-DD'. 비우면 '안 정함' — 가게에서 이용권을 쓸 때 쿠폰이 열린다 */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) visitDate?: string | null;
}

@Controller()
export class OrdersController {
  constructor(private prisma: PrismaService) {}

  // ---------------- 상품 ----------------

  @Get('products')
  @UseGuards(OptionalUserGuard)
  async products(@UserId() userId: string | undefined, @Query('merchantId') merchantId?: string, @Query('type') type?: string) {
    const db = this.prisma.client;
    const rows = await db.product.findMany({
      where: {
        isActive: true,
        ...(merchantId ? { merchantId } : {}),
        ...(type ? { type: type as never } : {}),
        // 판매 기간 밖(판매 전·끝남)은 목록에 안 보인다 (2026-09-19 문서 4-6)
        ...onSaleWhere(),
      },
      include: {
        merchant: {
          select: { id: true, name: true, i18n: true, region: { select: { name: true, i18n: true } }, ...MERCHANT_SCOPE_SELECT },
        },
        category: { select: { name: true, emoji: true, i18n: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // 회원가는 잼 범위를 따른다 (2026-09-24 대표 확정 3-5 A) — plan-scope.util.ts
    const memberPriced = await memberPriceProductIds(db, userId, rows);
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
    }).map((r) => ({
      ...r,
      isAd: ads.has(`PRODUCT:${r.id}`),
      /** 지금 보는 사람이 유료 회원 할인가를 받는지 — 가진 잼의 범위에 이 가게가 드는지 */
      memberPriceApplies: memberPriced.has(r.id),
    }));
  }

  @Get('products/:id')
  @UseGuards(OptionalUserGuard)
  async product(@UserId() userId: string | undefined, @Param('id') id: string) {
    const db = this.prisma.client;
    const p = await db.product.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, name: true, address: true, i18n: true, ...MERCHANT_SCOPE_SELECT } },
        slots: {
          where: { isOpen: true, startAt: { gt: new Date() } },
          orderBy: { startAt: 'asc' },
          take: 20,
        },
      },
    });
    if (!p) throw new NotFoundException('상품을 찾을 수 없습니다');

    // 이 상품에 회원가를 주는 잼과, 보는 사람이 그 대상인지 — 잼 범위를 따른다 (2026-09-24 대표 확정 3-5 A)
    const memberPricePlans = await plansGivingMemberPrice(db, p);
    const memberPriceApplies = (await memberPriceProductIds(db, userId, [p])).has(p.id);

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
      /** 이 상품에 회원가를 주는 잼 (판매 중인 공개 잼) */
      memberPricePlans,
      /** 지금 보는 사람이 할인가를 받는지 */
      memberPriceApplies,
      /** 판매 상태 — 'UPCOMING' 판매 전 · 'ON' 판매 중 · 'ENDED' 판매 끝 (판매 기간, 2026-09-19 문서 4-6) */
      saleState: saleState(p),
      /** 판매 기간·이용 기간 'YYYY-MM-DD' (비어 있으면 null) */
      period: periodKeys(p),
      /** 가는 날로 고를 수 있는 범위 'YYYY-MM-DD' — 이용 기간 안에서. 예약 상품은 예약한 날이 곧 가는 날이라 null */
      // 이용일이 하루로 정해진 티켓은 그 날이 곧 가는 날이라 묻지 않는다
      visitRange: p.type === 'RESERVATION' || fixedUseDay(p) ? null : (() => {
        const now = new Date();
        const w = voucherWindow(p, now);
        const r = visitDateRange(w.validFrom, w.validTo);
        return { from: dayKey(r.from), to: dayKey(r.to) };
      })(),
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
    const product = await db.product.findUnique({ where: { id }, include: { merchant: { select: MERCHANT_SCOPE_SELECT } } });
    if (!product || !product.isActive) throw new NotFoundException('판매 중인 상품이 아닙니다');

    // 2026-09-12 대표 확정: 상품 '유료 회원 가격'은 유료 잼 보유자만. 무료 회원은 기본 판매가로 산다.
    // 2026-09-24 대표 확정(3-5 A): 어느 잼이 회원가를 받는지는 잼 범위를 따른다 (상품마다 고르지 않는다).
    const isMember = (await memberPriceProductIds(db, userId, [product])).has(id);
    const unitPrice = isMember && product.memberPrice != null ? product.memberPrice : product.basePrice;

    if (product.type === 'RESERVATION' && !dto.slotId) {
      throw new BadRequestException('예약 시간을 선택해 주세요');
    }
    // 연락처 — 가게가 무슨 일이 있을 때 전화할 번호 (2026-09-29). 한 번 넣으면 회원 정보에 남는다
    const buyer = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true, nickname: true } });
    const phone = normalizePhone(dto.contactPhone) ?? normalizePhone(buyer.phone);
    if (!phone) throw new BadRequestException(PHONE_REQUIRED);
    // 판매 기간 밖이면 결제를 막는다 (2026-09-19 문서 4-6, 대표 '오픈 전 필수')
    const sale = saleState(product, now);
    if (sale === 'UPCOMING') throw new BadRequestException(`${dayLabel(product.saleFrom!)}부터 판매합니다`);
    if (sale === 'ENDED') throw new BadRequestException('판매 기간이 끝난 상품입니다');

    // 이용권을 쓸 수 있는 기간 — 상품의 이용 기간, 없으면 산 날부터 30일
    const win = voucherWindow(product, now);
    // 가는 날 — 티켓·PASS만, 이용 기간 안에서. 예약 상품은 예약한 날이 곧 가는 날이다.
    // 이용일이 하루로 정해진 티켓(불꽃축제처럼)은 그 날이 곧 가는 날 — 쿠폰도 그 날 0시에 열린다
    let visitDate: Date | null = fixedUseDay(product);
    if (!visitDate && dto.visitDate && product.type !== 'RESERVATION') {
      visitDate = parseDay(dto.visitDate);
      const err = visitDateError(visitDate, win.validFrom, win.validTo);
      if (err) throw new BadRequestException(err);
    }

    return db.$transaction(async (tx) => {
      if (phone !== buyer.phone) await tx.user.update({ where: { id: userId }, data: { phone } });
      // 한 사람당 수량 — 기획전의 '1인 1장' 같은 조건 (2026-09-24 대표 확정 3-3). 취소한 건은 세지 않는다.
      if (product.maxPerUser != null) {
        const mine = await tx.voucher.count({ where: { userId, productId: id, status: { not: 'CANCELLED' } } });
        if (mine >= product.maxPerUser) {
          throw new BadRequestException(`이 상품은 한 사람당 ${product.maxPerUser}장까지 살 수 있습니다`);
        }
      }

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
          // 지금은 연습 결제. 토스를 붙일 때 휴대폰 결제는 결제창에서 뺀다 — 결제한 달 말일까지만 취소돼서
          // '구매 후 3개월 환불'을 지킬 수 없다 (2026-09-29 대표 확정)
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
          validFrom: slot ? now : win.validFrom,
          validTo: slot ? slot.endAt : win.validTo,
          status: slot ? 'RESERVED' : 'ISSUED',
          visitDate,
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
            contactName: dto.contactName?.trim() || buyer.nickname,
            contactPhone: phone,
            status: 'CONFIRMED',
          },
        });
      }

      // 상품에 묶인 '근처 할인 쿠폰'을 구매자에게 담아 준다 (2026-09-12 대표 확정).
      // 언제 열리는지는 상품 종류와 손님이 고른 날로 저절로 정해진다 (2026-09-24 대표 확정 3-2):
      //   예약 상품 = 예약한 날 0시 / 티켓·PASS = 가는 날 0시, 안 고르면 가게에서 이용권을 쓸 때
      // 일단 잠가 담고, 여는 날은 syncBundledCoupons가 한 곳에서 맞춘다.
      const seen = new Set<string>();
      const rules = await tx.benefitGrantRule.findMany({
        where: { trigger: 'PRODUCT', productId: id, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      for (const rule of rules) {
        if (seen.has(rule.benefitId)) continue;
        seen.add(rule.benefitId);
        const key = {
          userId_benefitId_sourceType_sourceId: { userId, benefitId: rule.benefitId, sourceType: 'PRODUCT' as const, sourceId: id },
        };
        const had = await tx.userBenefit.findUnique({ where: key, select: { status: true, validTo: true } });
        const alive = had && (had.status === 'PENDING' || had.status === 'ACTIVE') && (!had.validTo || had.validTo > now);
        if (!had) {
          await tx.userBenefit.create({
            data: {
              userId, benefitId: rule.benefitId, sourceType: 'PRODUCT', sourceId: id,
              status: 'PENDING', validFrom: now, validTo: voucher.validTo,
            },
          });
        } else if (!alive) {
          // 다 쓴·기한 지난·거둬들인 쿠폰 — 같은 상품을 또 샀으니 한 벌 더 받는다
          await tx.userBenefit.update({ where: key, data: { status: 'PENDING', validFrom: now, validTo: voucher.validTo } });
        }
        // 아직 살아 있는 쿠폰은 그대로 둔다 — 이미 열린 쿠폰이 다시 잠기지 않게
      }
      await syncBundledCoupons(tx, userId, id, now);

      const mine = seen.size
        ? await tx.userBenefit.findMany({
            where: { userId, sourceType: 'PRODUCT', sourceId: id, benefitId: { in: [...seen] }, status: { in: ['PENDING', 'ACTIVE'] } },
            select: { status: true, validFrom: true },
          })
        : [];
      const pendingBenefits = mine.filter((b) => b.status === 'PENDING').length;
      const later = mine.filter((b) => b.status === 'ACTIVE' && b.validFrom > now);
      const grantedBenefits = mine.length - pendingBenefits;
      const opensAt = later[0]?.validFrom ?? null;
      const openNow = grantedBenefits - later.length;
      return {
        ok: true,
        orderNo: order.orderNo,
        paidAmount: amount,
        memberApplied: isMember && product.memberPrice != null,
        voucher: { id: voucher.id, code: voucher.code, validTo: voucher.validTo, visitDay: visitDate ? dayKey(visitDate) : null },
        reservation: reservation
          ? { id: reservation.id, startAt: slot!.startAt, headcount: reservation.headcount, status: reservation.status }
          : null,
        grantedBenefits,
        /** 아직 열리지 않은 쿠폰 — 현장에서 이용권을 쓰면 열린다 */
        pendingBenefits,
        /** 예약한 날·가는 날 0시에 열리는 쿠폰이면 그 시각 */
        couponsOpenAt: opensAt,
        message: pendingBenefits > 0
          ? `결제 완료! 할인 쿠폰 ${pendingBenefits}장을 담았어요. 현장에서 이용권을 쓰면 바로 열립니다.`
          : later.length > 0
            ? reservation
              ? `예약이 확정됐어요! 할인 쿠폰 ${later.length}장은 이용일부터 쓸 수 있어요.`
              : `결제 완료! 할인 쿠폰 ${later.length}장은 가는 날(${dayLabel(opensAt!)}) 0시에 열려요. 그 전에 가게에서 이용권을 쓰면 바로 열립니다.`
            : openNow > 0
              ? reservation
                ? `예약이 확정됐어요! 할인 쿠폰 ${openNow}장을 지금부터 쓸 수 있어요.`
                : `결제 완료! 근처에서 바로 쓸 수 있는 할인 쿠폰 ${openNow}장을 함께 받았어요.`
              : reservation
                ? '결제와 예약이 함께 확정되었습니다.'
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
            name: true, type: true, verification: true, i18n: true, useFrom: true, useTo: true,
            merchant: { select: { id: true, name: true, address: true, i18n: true } },
          },
        },
        reservation: { include: { slot: { select: { startAt: true, endAt: true } } } },
      },
    });
    const now = new Date();
    return rows.map((v) => {
      // 가는 날은 안 쓴 티켓·PASS에서, 고른 날이 오기 전까지만 고르거나 바꾼다 (그날 0시에 쿠폰이 열리므로)
      const editable =
        v.product.type !== 'RESERVATION' && !fixedUseDay(v.product) && v.status === 'ISSUED' && v.validTo > now &&
        !(v.visitDate && v.visitDate <= now);
      const r = editable ? visitDateRange(v.validFrom > now ? v.validFrom : now, v.validTo) : null;
      return {
        ...v,
        /** 손님이 고른 가는 날 'YYYY-MM-DD' (없으면 null) */
        visitDay: v.visitDate ? dayKey(v.visitDate) : null,
        /** 이용 기간이 아직 시작 전이면 시작일 'YYYY-MM-DD' — 그 전에는 가게에서 못 쓴다 */
        usableFrom: v.validFrom > now ? dayKey(v.validFrom) : null,
        /** 가는 날을 고르거나 바꿀 수 있으면 고를 수 있는 범위 */
        visitRange: r ? { from: dayKey(r.from), to: dayKey(r.to) } : null,
      };
    });
  }

  /**
   * 가는 날 고르기·바꾸기·지우기 — 2026-09-24 대표 확정(3-2) "고른 가는 날은 나중에 바꿀 수 있게".
   * 고른 날이 오면(그날 0시에 쿠폰이 열리면) 더는 바꾸지 않는다. 열린 쿠폰이 다시 잠기면 헷갈린다.
   */
  @Patch('me/vouchers/:id/visit-date')
  @UseGuards(UserGuard)
  async setVisitDate(@UserId() userId: string, @Param('id') id: string, @Body() dto: VisitDateDto) {
    const db = this.prisma.client;
    const now = new Date();
    const v = await db.voucher.findFirst({
      where: { id, userId }, include: { product: { select: { type: true, useFrom: true, useTo: true } } },
    });
    if (!v) throw new NotFoundException('이용권을 찾을 수 없습니다');
    if (v.product.type === 'RESERVATION') throw new BadRequestException('예약 상품은 예약한 날에 쿠폰이 열립니다');
    if (fixedUseDay(v.product)) throw new BadRequestException('이용일이 정해진 상품이라 가는 날을 바꿀 수 없습니다');
    if (v.status !== 'ISSUED' || v.validTo <= now) {
      throw new BadRequestException('아직 쓰지 않은 이용권만 가는 날을 바꿀 수 있습니다');
    }
    if (v.visitDate && v.visitDate <= now) {
      throw new BadRequestException(`가는 날(${dayLabel(v.visitDate)})이 되어 쿠폰이 이미 열렸어요. 날짜는 그 전까지만 바꿀 수 있습니다`);
    }
    let day: Date | null = null;
    if (dto.visitDate) {
      day = parseDay(dto.visitDate);
      const err = visitDateError(day, v.validFrom > now ? v.validFrom : now, v.validTo);
      if (err) throw new BadRequestException(err);
    }
    return db.$transaction(async (tx) => {
      await tx.voucher.update({ where: { id }, data: { visitDate: day } });
      const opensAt = await syncBundledCoupons(tx, userId, v.productId, now);
      await tx.eventLog.create({
        data: { userId, event: 'visit_date_set', entityType: 'voucher', entityId: id, meta: { visitDay: day ? dayKey(day) : null } },
      });
      return { ok: true, visitDay: day ? dayKey(day) : null, couponsOpenAt: opensAt };
    });
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
