/**
 * 본사 관리자 API.
 * 대시보드는 "얼마나 가입했는지"보다 실제 거래·사용·재방문을 보여준다.
 * 상태를 바꾸는 모든 행동은 AuditLog에 남긴다.
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { AdminGuard, AdminId, AuthModule } from './auth';

class RejectDto {
  @IsString() @MinLength(2) reason!: string;
}
class CreateMerchantDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() categoryId!: string;
  @IsString() regionId!: string;
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(30) commissionRate?: number;
}
class PatchMerchantDto {
  @IsOptional() @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']) status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(30) commissionRate?: number;
  @IsOptional() @IsString() ownerUserId?: string;
}
class CancelRedemptionDto {
  @IsString() @MinLength(2) reason!: string;
}
class GenerateSettlementDto {
  @IsString() periodStart!: string; // ISO
  @IsString() periodEnd!: string;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private prisma: PrismaService) {}

  private audit(adminId: string, action: string, targetType: string, targetId: string, memo?: string) {
    return this.prisma.client.auditLog.create({
      data: { adminUserId: adminId, action, targetType, targetId, memo },
    });
  }

  // ---------------- 대시보드 ----------------

  @Get('stats')
  async stats() {
    const db = this.prisma.client;
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const [
      users, activeMemberships, activeMerchants,
      openDrops, pendingDrops,
      todayRedemptions, monthRedemptions,
      monthOrders, monthSavedAgg,
    ] = await Promise.all([
      db.user.count({ where: { status: 'ACTIVE' } }),
      db.userMembership.count({ where: { status: 'ACTIVE', endAt: { gt: now } } }),
      db.merchant.count({ where: { status: 'ACTIVE' } }),
      db.drop.count({ where: { status: 'OPEN' } }),
      db.drop.count({ where: { status: 'PENDING' } }),
      db.redemption.count({ where: { status: 'DONE', createdAt: { gte: todayStart } } }),
      db.redemption.count({ where: { status: 'DONE', createdAt: { gte: monthStart } } }),
      db.order.aggregate({
        where: { status: 'PAID', paidAt: { gte: monthStart } },
        _sum: { paidAmount: true }, _count: true,
      }),
      db.redemption.aggregate({
        where: { status: 'DONE', createdAt: { gte: monthStart } },
        _sum: { savedAmount: true },
      }),
    ]);

    return {
      users,
      activeMemberships,
      activeMerchants,
      openDrops,
      pendingDrops,
      todayRedemptions,
      monthRedemptions,
      monthGmv: monthOrders._sum.paidAmount ?? 0,
      monthOrderCount: monthOrders._count,
      monthSavedAmount: monthSavedAgg._sum.savedAmount ?? 0,
    };
  }

  // ---------------- DROP 승인 ----------------

  @Get('drops')
  drops(@Query('status') status?: string) {
    return this.prisma.client.drop.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        merchant: { select: { name: true } },
        region: { select: { name: true } },
        category: { select: { name: true, emoji: true } },
      },
    });
  }

  @Post('drops/:id/approve')
  async approveDrop(@AdminId() adminId: string, @Param('id') id: string) {
    const drop = await this.prisma.client.drop.findUnique({ where: { id } });
    if (!drop) throw new NotFoundException();
    if (drop.status !== 'PENDING') throw new BadRequestException('승인 대기 상태가 아닙니다');
    const now = new Date();
    const status = drop.openAt <= now ? 'OPEN' : 'SCHEDULED';
    await this.prisma.client.drop.update({ where: { id }, data: { status, approvedAt: now } });
    await this.audit(adminId, 'DROP_APPROVE', 'Drop', id);
    return { ok: true, status };
  }

  @Post('drops/:id/reject')
  async rejectDrop(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: RejectDto) {
    const drop = await this.prisma.client.drop.findUnique({ where: { id } });
    if (!drop) throw new NotFoundException();
    await this.prisma.client.drop.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: dto.reason },
    });
    await this.audit(adminId, 'DROP_REJECT', 'Drop', id, dto.reason);
    return { ok: true };
  }

  // ---------------- 가맹점 ----------------

  @Get('merchants')
  merchants(@Query('status') status?: string) {
    return this.prisma.client.merchant.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        region: { select: { name: true } },
        category: { select: { name: true, emoji: true } },
        qrCodes: { where: { isActive: true }, select: { code: true, label: true } },
        _count: { select: { redemptions: true, drops: true } },
      },
    });
  }

  @Post('merchants')
  async createMerchant(@AdminId() adminId: string, @Body() dto: CreateMerchantDto) {
    const m = await this.prisma.client.merchant.create({
      data: {
        name: dto.name,
        categoryId: dto.categoryId,
        regionId: dto.regionId,
        intro: dto.intro,
        address: dto.address,
        ownerUserId: dto.ownerUserId,
        commissionRate: dto.commissionRate ?? 0,
        status: 'ACTIVE',
      },
    });
    await this.audit(adminId, 'MERCHANT_CREATE', 'Merchant', m.id, dto.name);
    return m;
  }

  @Patch('merchants/:id')
  async patchMerchant(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchMerchantDto) {
    const m = await this.prisma.client.merchant.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status as never } : {}),
        ...(dto.commissionRate != null ? { commissionRate: dto.commissionRate } : {}),
        ...(dto.ownerUserId ? { ownerUserId: dto.ownerUserId } : {}),
      },
    });
    await this.audit(adminId, 'MERCHANT_UPDATE', 'Merchant', id, JSON.stringify(dto));
    return m;
  }

  /** 매장 고정 QR 발급 */
  @Post('merchants/:id/qr')
  async issueQr(@AdminId() adminId: string, @Param('id') id: string, @Body('label') label?: string) {
    const merchant = await this.prisma.client.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException();
    const code = `HG-${merchant.name.replace(/\s/g, '').slice(0, 8)}-${randomBytes(4).toString('hex')}`;
    const qr = await this.prisma.client.merchantQr.create({
      data: { merchantId: id, code, label: label ?? '카운터' },
    });
    await this.audit(adminId, 'QR_ISSUE', 'MerchantQr', qr.id, code);
    return qr;
  }

  // ---------------- 회원 ----------------

  @Get('users')
  users(@Query('q') q?: string) {
    return this.prisma.client.user.findMany({
      where: q ? { OR: [{ nickname: { contains: q } }, { email: { contains: q } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, nickname: true, provider: true, email: true, status: true,
        createdAt: true, lastLoginAt: true,
        memberships: {
          where: { status: 'ACTIVE', endAt: { gt: new Date() } },
          select: { plan: { select: { name: true } }, endAt: true, source: true },
        },
        _count: { select: { redemptions: true, orders: true } },
      },
    });
  }

  // ---------------- 사용내역 / CS ----------------

  @Get('redemptions')
  redemptions(@Query('days') days?: string) {
    const since = new Date();
    since.setDate(since.getDate() - (Number(days) || 7));
    return this.prisma.client.redemption.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { nickname: true } },
        merchant: { select: { name: true } },
        userBenefit: { include: { benefit: { select: { title: true } } } },
        dropClaim: { include: { drop: { select: { title: true } } } },
        voucher: { include: { product: { select: { name: true } } } },
      },
    });
  }

  /** 오조작 사용취소 — 본사 CS만 가능. 원 상태를 복구한다. */
  @Post('redemptions/:id/cancel')
  async cancelRedemption(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: CancelRedemptionDto) {
    const db = this.prisma.client;
    const r = await db.redemption.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    if (r.status === 'CANCELLED') throw new BadRequestException('이미 취소된 건입니다');

    await db.$transaction(async (tx) => {
      await tx.redemption.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
      });
      if (r.userBenefitId) {
        await tx.userBenefit.update({
          where: { id: r.userBenefitId },
          data: { usedCount: { decrement: 1 }, status: 'ACTIVE' },
        });
      }
      if (r.dropClaimId) {
        await tx.dropClaim.update({
          where: { id: r.dropClaimId },
          data: { status: 'CLAIMED', usedAt: null },
        });
      }
      if (r.voucherId) {
        await tx.voucher.update({
          where: { id: r.voucherId },
          data: { status: 'ISSUED', usedAt: null },
        });
      }
    });
    await this.audit(adminId, 'REDEMPTION_CANCEL', 'Redemption', id, dto.reason);
    return { ok: true };
  }

  // ---------------- 정산 ----------------

  @Get('settlements')
  settlements() {
    return this.prisma.client.settlement.findMany({
      orderBy: { periodEnd: 'desc' },
      take: 100,
      include: { merchant: { select: { name: true } } },
    });
  }

  /**
   * 기간 정산 생성: 해당 기간의 이용권 사용(Redemption VOUCHER 기준) 매출을
   * 가맹점별로 모아 수수료를 계산한다.
   */
  @Post('settlements/generate')
  async generate(@AdminId() adminId: string, @Body() dto: GenerateSettlementDto) {
    const db = this.prisma.client;
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (!(periodStart < periodEnd)) throw new BadRequestException('기간이 올바르지 않습니다');

    const used = await db.redemption.findMany({
      where: {
        status: 'DONE', type: 'VOUCHER',
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      include: {
        voucher: { include: { order: { include: { items: true } } } },
        merchant: { select: { id: true, commissionRate: true } },
      },
    });

    const byMerchant = new Map<string, { gross: number; rate: number }>();
    for (const r of used) {
      if (!r.voucher) continue;
      const item = r.voucher.order.items.find((i) => i.productId === r.voucher!.productId);
      const gross = item?.amount ?? 0;
      const cur = byMerchant.get(r.merchantId) ?? { gross: 0, rate: Number(r.merchant.commissionRate) };
      cur.gross += gross;
      byMerchant.set(r.merchantId, cur);
    }

    const created = [];
    for (const [merchantId, { gross, rate }] of byMerchant) {
      const fee = Math.floor((gross * rate) / 100);
      const row = await db.settlement.upsert({
        where: { merchantId_periodStart_periodEnd: { merchantId, periodStart, periodEnd } },
        update: { grossAmount: gross, feeAmount: fee, netAmount: gross - fee },
        create: {
          merchantId, periodStart, periodEnd,
          grossAmount: gross, feeAmount: fee, netAmount: gross - fee,
        },
      });
      created.push(row);
    }
    await this.audit(adminId, 'SETTLEMENT_GENERATE', 'Settlement', `${dto.periodStart}~${dto.periodEnd}`, `${created.length}건`);
    return { ok: true, count: created.length, settlements: created };
  }

  @Post('settlements/:id/confirm')
  async confirmSettlement(@AdminId() adminId: string, @Param('id') id: string) {
    const s = await this.prisma.client.settlement.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await this.audit(adminId, 'SETTLEMENT_CONFIRM', 'Settlement', id);
    return s;
  }

  // ---------------- 감사 로그 ----------------

  @Get('audit')
  auditLogs() {
    return this.prisma.client.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { adminUser: { select: { name: true } } },
    });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [PrismaService],
})
export class AdminModule {}
