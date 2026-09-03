/**
 * 현장 사용 — 서비스의 마지막 1미터.
 *
 * 흐름: 손님이 매장 고정 QR을 스캔
 *   → GET /scan/:qrCode : "이 매장에서 지금 쓸 수 있는 것"만 계산해서 돌려준다
 *   → POST /redeem      : 선택한 항목을 사용처리하고 Redemption을 남긴다
 *   → 완료화면에는 verifyToken(6자리) + 실시간 시계 표시. 90초 후 만료.
 *     직원 확인이 필요한 상품(QR_PIN)은 가맹점 모드의 verify로 이 토큰을 조회한다.
 *
 * 절약금액(savedAmount)은 여기서 계산되어 "이번 달 얼마 아꼈어요"의 원천이 된다.
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { langOf, trField } from './i18n.util';
import { makeVerifyToken, minutesOfDay } from './util';

const VERIFY_TTL_MS = 90_000;

class RedeemDto {
  @IsString() qrCode!: string;
  @IsIn(['BENEFIT', 'DROP', 'VOUCHER']) itemType!: 'BENEFIT' | 'DROP' | 'VOUCHER';
  @IsString() itemId!: string; // userBenefitId | dropClaimId | voucherId
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) headcount?: number;
  /** PERCENT 혜택일 때 결제 예정 금액. 절약액 계산용(선택). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) billAmount?: number;
}

@Controller()
export class ScanController {
  constructor(private prisma: PrismaService) {}

  /** 매장 QR 스캔 → 이 매장에서 내가 지금 쓸 수 있는 것 */
  @Get('scan/:qrCode')
  @UseGuards(UserGuard)
  async scan(@UserId() userId: string, @Param('qrCode') qrCode: string, @Req() req: any) {
    const lang = langOf(req);
    const db = this.prisma.client;
    const now = new Date();

    const qr = await db.merchantQr.findUnique({
      where: { code: qrCode },
      include: { merchant: { include: { region: { select: { name: true, i18n: true } } } } },
    });
    if (!qr || !qr.isActive || qr.merchant.status !== 'ACTIVE') {
      throw new NotFoundException('등록되지 않은 매장 QR입니다');
    }
    const merchant = qr.merchant;

    // 1) 상시 혜택 (내게 열려 있는 것)
    const benefits = await db.userBenefit.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        benefit: { merchantId: merchant.id, isActive: true },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      include: { benefit: true },
    });

    // 오늘 이 혜택을 몇 번 썼는지 (maxUsePerDay 검사용)
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const usableBenefits = [];
    for (const ub of benefits) {
      let blocked: string | null = null;
      if (ub.benefit.maxUsePerDay) {
        const todayUsed = await db.redemption.count({
          where: { userBenefitId: ub.id, status: 'DONE', createdAt: { gte: todayStart } },
        });
        if (todayUsed >= ub.benefit.maxUsePerDay) blocked = '오늘 사용 횟수를 모두 썼습니다';
      }
      if (ub.benefit.maxUsePerUser && ub.usedCount >= ub.benefit.maxUsePerUser) {
        blocked = '사용 횟수를 모두 썼습니다';
      }
      usableBenefits.push({
        id: ub.id,
        title: ub.benefit.title,
        type: ub.benefit.type,
        value: ub.benefit.value,
        freebieName: ub.benefit.freebieName,
        companionLimit: ub.benefit.companionLimit,
        conditions: ub.benefit.conditions,
        validTo: ub.validTo,
        blocked,
        i18n: (ub.benefit as any).i18n,
      } as any);
    }

    // 2) 이 매장 DROP 딜 (받아둔 것)
    const claims = await db.dropClaim.findMany({
      where: {
        userId,
        status: 'CLAIMED',
        validTo: { gt: now },
        drop: { merchantId: merchant.id },
      },
      include: { drop: true },
    });
    const nowMin = minutesOfDay(now);
    const usableClaims = claims.map((c) => {
      let blocked: string | null = null;
      const d = c.drop;
      if (d.usableFromMinute != null && d.usableToMinute != null) {
        if (nowMin < d.usableFromMinute || nowMin > d.usableToMinute) {
          const f = `${String(Math.floor(d.usableFromMinute / 60)).padStart(2, '0')}:${String(d.usableFromMinute % 60).padStart(2, '0')}`;
          const t = `${String(Math.floor(d.usableToMinute / 60)).padStart(2, '0')}:${String(d.usableToMinute % 60).padStart(2, '0')}`;
          blocked = `사용 가능 시간: ${f}~${t}`;
        }
      }
      return {
        id: c.id,
        title: d.title,
        qty: c.qty,
        normalPrice: d.normalPrice,
        dropPrice: d.dropPrice,
        validTo: c.validTo,
        blocked,
        i18n: (d as any).i18n,
      } as any;
    });

    // 3) 이 매장 이용권 (구매한 것)
    const vouchers = await db.voucher.findMany({
      where: {
        userId,
        status: { in: ['ISSUED', 'RESERVED'] },
        validTo: { gt: now },
        product: { merchantId: merchant.id },
      },
      include: {
        product: { select: { name: true, verification: true, i18n: true } },
        reservation: { include: { slot: { select: { startAt: true } } } },
      },
    });

    return {
      merchant: {
        id: merchant.id,
        name: trField(merchant, 'name', lang),
        region: trField(merchant.region, 'name', lang),
        address: trField(merchant, 'address', lang),
      },
      benefits: usableBenefits,
      dropClaims: usableClaims,
      vouchers: vouchers.map((v) => ({
        id: v.id,
        code: v.code,
        productName: trField(v.product, 'name', lang),
        verification: v.product.verification,
        headcount: v.headcount,
        reservedAt: v.reservation?.slot.startAt ?? null,
        validTo: v.validTo,
      })),
      empty: usableBenefits.length + usableClaims.length + vouchers.length === 0,
    };
  }

  /** 사용처리 */
  @Post('redeem')
  @UseGuards(UserGuard)
  async redeem(@UserId() userId: string, @Body() dto: RedeemDto, @Req() req: any) {
    const lang = langOf(req);
    const db = this.prisma.client;
    const now = new Date();

    const qr = await db.merchantQr.findUnique({
      where: { code: dto.qrCode },
      include: { merchant: true },
    });
    if (!qr || !qr.isActive || qr.merchant.status !== 'ACTIVE') {
      throw new NotFoundException('등록되지 않은 매장 QR입니다');
    }
    const merchant = qr.merchant;
    const headcount = dto.headcount ?? 1;
    const verifyToken = makeVerifyToken();
    const verifyExpires = new Date(now.getTime() + VERIFY_TTL_MS);

    return db.$transaction(async (tx) => {
      if (dto.itemType === 'BENEFIT') {
        const ub = await tx.userBenefit.findFirst({
          where: {
            id: dto.itemId, userId, status: 'ACTIVE',
            benefit: { merchantId: merchant.id, isActive: true },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
          include: { benefit: true },
        });
        if (!ub) throw new BadRequestException('사용할 수 없는 혜택입니다');
        if (ub.benefit.companionLimit != null && headcount > ub.benefit.companionLimit + 1) {
          throw new BadRequestException(`본인 포함 최대 ${ub.benefit.companionLimit + 1}명까지 적용됩니다`);
        }
        if (ub.benefit.maxUsePerDay) {
          const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
          const todayUsed = await tx.redemption.count({
            where: { userBenefitId: ub.id, status: 'DONE', createdAt: { gte: todayStart } },
          });
          if (todayUsed >= ub.benefit.maxUsePerDay) {
            throw new BadRequestException('오늘 사용 횟수를 모두 썼습니다');
          }
        }

        let saved = 0;
        if (ub.benefit.type === 'AMOUNT') saved = ub.benefit.value;
        if (ub.benefit.type === 'PERCENT' && dto.billAmount) {
          saved = Math.floor((dto.billAmount * ub.benefit.value) / 100);
        }

        await tx.userBenefit.update({
          where: { id: ub.id },
          data: {
            usedCount: { increment: 1 },
            ...(ub.benefit.maxUsePerUser && ub.usedCount + 1 >= ub.benefit.maxUsePerUser
              ? { status: 'EXHAUSTED' }
              : {}),
          },
        });

        const r = await tx.redemption.create({
          data: {
            userId, merchantId: merchant.id, type: 'BENEFIT',
            userBenefitId: ub.id, merchantQrId: qr.id,
            headcount, savedAmount: saved, verifyToken, verifyExpires,
          },
        });
        return this.done(r.id, trField(merchant, 'name', lang), trField(ub.benefit, 'title', lang), saved, verifyToken, verifyExpires, 'QR_ONLY');
      }

      if (dto.itemType === 'DROP') {
        const claim = await tx.dropClaim.findFirst({
          where: {
            id: dto.itemId, userId, status: 'CLAIMED', validTo: { gt: now },
            drop: { merchantId: merchant.id },
          },
          include: { drop: true },
        });
        if (!claim) throw new BadRequestException('사용할 수 없는 딜입니다');

        const d = claim.drop;
        if (d.usableFromMinute != null && d.usableToMinute != null) {
          const nowMin = minutesOfDay(now);
          if (nowMin < d.usableFromMinute || nowMin > d.usableToMinute) {
            throw new BadRequestException('지금은 사용 가능 시간이 아닙니다');
          }
        }

        const saved = (d.normalPrice - d.dropPrice) * claim.qty;
        await tx.dropClaim.update({
          where: { id: claim.id },
          data: { status: 'USED', usedAt: now },
        });
        const r = await tx.redemption.create({
          data: {
            userId, merchantId: merchant.id, type: 'DROP',
            dropClaimId: claim.id, merchantQrId: qr.id,
            headcount: d.personsPerUnit * claim.qty, savedAmount: saved,
            verifyToken, verifyExpires,
          },
        });
        return this.done(r.id, trField(merchant, 'name', lang), trField(d, 'title', lang), saved, verifyToken, verifyExpires, 'QR_ONLY');
      }

      // VOUCHER
      const voucher = await tx.voucher.findFirst({
        where: {
          id: dto.itemId, userId, status: { in: ['ISSUED', 'RESERVED'] }, validTo: { gt: now },
          product: { merchantId: merchant.id },
        },
        include: {
          product: true,
          order: { include: { items: true } },
          reservation: true,
        },
      });
      if (!voucher) throw new BadRequestException('사용할 수 없는 이용권입니다');

      const paidUnit =
        voucher.order.items.find((i) => i.productId === voucher.productId)?.unitPrice ??
        voucher.product.basePrice;
      const saved = Math.max(0, (voucher.product.basePrice - paidUnit) * (voucher.reservation?.headcount ?? 1));

      await tx.voucher.update({ where: { id: voucher.id }, data: { status: 'USED', usedAt: now } });
      if (voucher.reservation) {
        await tx.reservation.update({
          where: { id: voucher.reservation.id },
          data: { status: 'COMPLETED' },
        });
      }

      const r = await tx.redemption.create({
        data: {
          userId, merchantId: merchant.id, type: 'VOUCHER',
          voucherId: voucher.id, merchantQrId: qr.id,
          headcount: voucher.headcount, savedAmount: saved,
          verifyToken, verifyExpires,
        },
      });
      return this.done(
        r.id, trField(merchant, 'name', lang), trField(voucher.product, 'name', lang), saved,
        verifyToken, verifyExpires, voucher.product.verification,
      );
    });
  }

  private done(
    redemptionId: string, merchantName: string, itemTitle: string, saved: number,
    verifyToken: string, verifyExpires: Date, verification: string,
  ) {
    return {
      ok: true,
      redemptionId,
      merchantName,
      itemTitle,
      savedAmount: saved,
      verifyToken,
      verifyExpires,
      /** QR_PIN 상품이면 완료화면에 "직원 확인 필요" 안내를 띄운다 */
      staffCheckRequired: verification !== 'QR_ONLY',
      usedAt: new Date(),
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ScanController],
  providers: [PrismaService],
})
export class ScanModule {}
