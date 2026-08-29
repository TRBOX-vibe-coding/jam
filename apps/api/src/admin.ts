/**
 * 본사 관리자 API.
 * 대시보드는 "얼마나 가입했는지"보다 실제 거래·사용·재방문을 보여준다.
 * 상태를 바꾸는 모든 행동은 AuditLog에 남긴다.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { saveImageDataUrl } from './uploads';
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
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsString() regionId?: string;
  @IsOptional() @IsString() categoryId?: string;
}
class PatchUserDto {
  @IsIn(['ACTIVE', 'DORMANT', 'WITHDRAWN']) status!: string;
  @IsOptional() @IsString() reason?: string;
}
class PatchDropDto {
  @IsOptional() @IsString() @MinLength(4) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) normalPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) dropPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) totalQty?: number;
  @IsOptional() @IsString() closeAt?: string;
  /// 'PENDING'으로 보내면 승인 대기 상태로 되돌린다
  @IsOptional() @IsIn(['PENDING']) status?: string;
}
class PatchSlotDto {
  @IsOptional() isOpen?: boolean;
  @IsOptional() @IsString() startAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(600) durationMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) capacity?: number;
}
class CancelRedemptionDto {
  @IsString() @MinLength(2) reason!: string;
}
class GenerateSettlementDto {
  @IsString() periodStart!: string; // ISO
  @IsString() periodEnd!: string;
}
class CreateProductDto {
  @IsString() merchantId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsIn(['TICKET', 'RESERVATION', 'PASS']) type!: string;
  @Type(() => Number) @IsInt() @Min(100) basePrice!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) memberPrice?: number;
  @IsOptional() @IsIn(['QR_ONLY', 'QR_PIN', 'STAFF_CONFIRM']) verification?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() cancelPolicy?: string;
  @IsOptional() @IsString() imageBase64?: string;
}
class PatchProductDto {
  @IsOptional() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) basePrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) memberPrice?: number;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() imageBase64?: string;
}
class CreateSlotDto {
  @IsString() startAt!: string; // ISO
  @Type(() => Number) @IsInt() @Min(15) @Max(600) durationMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(200) capacity!: number;
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

  /** 딜 수정 + 승인 대기로 되돌리기 */
  @Patch('drops/:id')
  async patchDrop(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchDropDto) {
    const drop = await this.prisma.client.drop.findUnique({ where: { id } });
    if (!drop) throw new NotFoundException();
    const data: Record<string, unknown> = {};
    if (dto.title) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.normalPrice != null) data.normalPrice = dto.normalPrice;
    if (dto.dropPrice != null) data.dropPrice = dto.dropPrice;
    if (dto.closeAt) {
      const c = new Date(dto.closeAt);
      if (Number.isNaN(c.getTime())) throw new BadRequestException('마감 시각이 올바르지 않습니다');
      data.closeAt = c;
    }
    if (dto.totalQty != null) {
      // 총 수량 변경 시 이미 팔린 만큼은 유지하고 남은 수량만 조정한다
      const sold = drop.totalQty - drop.remainingQty;
      if (dto.totalQty < sold) throw new BadRequestException(`이미 ${sold}개가 판매되어 그 이하로 줄일 수 없습니다`);
      data.totalQty = dto.totalQty;
      data.remainingQty = dto.totalQty - sold;
    }
    if (dto.status === 'PENDING') {
      data.status = 'PENDING';
      data.approvedAt = null;
    }
    const np = (data.normalPrice as number) ?? drop.normalPrice;
    const dp = (data.dropPrice as number) ?? drop.dropPrice;
    if (dp >= np) throw new BadRequestException('할인가는 정상가보다 낮아야 합니다');
    const updated = await this.prisma.client.drop.update({ where: { id }, data: data as never });
    await this.audit(adminId, 'DROP_UPDATE', 'Drop', id, JSON.stringify(dto));
    return updated;
  }

  /** 딜 삭제 — 수령자가 있으면 취소 처리(기록 보존), 없으면 완전 삭제 */
  @Delete('drops/:id')
  async deleteDrop(@AdminId() adminId: string, @Param('id') id: string) {
    const db = this.prisma.client;
    const drop = await db.drop.findUnique({ where: { id }, include: { _count: { select: { claims: true } } } });
    if (!drop) throw new NotFoundException();
    if (drop._count.claims > 0) {
      await db.drop.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit(adminId, 'DROP_CANCEL', 'Drop', id, `수령 ${drop._count.claims}건 존재 → 취소 처리`);
      return { ok: true, mode: 'CANCELLED', message: '수령 이력이 있어 삭제 대신 취소 처리했습니다' };
    }
    await db.drop.delete({ where: { id } });
    await this.audit(adminId, 'DROP_DELETE', 'Drop', id, drop.title);
    return { ok: true, mode: 'DELETED' };
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
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.intro !== undefined ? { intro: dto.intro } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
        ...(dto.regionId ? { regionId: dto.regionId } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      },
    });
    await this.audit(adminId, 'MERCHANT_UPDATE', 'Merchant', id, JSON.stringify(dto));
    return m;
  }

  /** 가맹점 삭제 — 거래 이력이 있으면 폐점 처리(기록 보존), 없으면 완전 삭제 */
  @Delete('merchants/:id')
  async deleteMerchant(@AdminId() adminId: string, @Param('id') id: string) {
    const db = this.prisma.client;
    const m = await db.merchant.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true, drops: true, products: true } } },
    });
    if (!m) throw new NotFoundException();
    const hasHistory = m._count.redemptions > 0 || m._count.drops > 0 || m._count.products > 0;
    if (hasHistory) {
      await db.merchant.update({ where: { id }, data: { status: 'CLOSED' } });
      await this.audit(adminId, 'MERCHANT_CLOSE', 'Merchant', id, '이력 존재 → 폐점 처리');
      return { ok: true, mode: 'CLOSED', message: '거래 이력이 있어 삭제 대신 폐점 처리했습니다' };
    }
    await db.merchant.delete({ where: { id } });
    await this.audit(adminId, 'MERCHANT_DELETE', 'Merchant', id, m.name);
    return { ok: true, mode: 'DELETED' };
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
  async users(@Query('q') q?: string, @Query('page') page?: string, @Query('size') size?: string) {
    const where = q ? { OR: [{ nickname: { contains: q } }, { email: { contains: q } }] } : {};
    const p = Math.max(1, Number(page) || 1);
    const s = Math.min(50, Math.max(5, Number(size) || 20));
    const [total, items] = await Promise.all([
      this.prisma.client.user.count({ where }),
      this.prisma.client.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * s,
        take: s,
        select: {
          id: true, nickname: true, provider: true, email: true, status: true,
          createdAt: true, lastLoginAt: true,
          memberships: {
            where: { status: 'ACTIVE', endAt: { gt: new Date() } },
            select: { plan: { select: { name: true } }, endAt: true, source: true },
          },
          _count: { select: { redemptions: true, orders: true } },
        },
      }),
    ]);
    return { items, total, page: p, size: s, pages: Math.max(1, Math.ceil(total / s)) };
  }

  /** 회원 상태 변경 — 정지(DORMANT) / 탈퇴 처리(WITHDRAWN) / 복구(ACTIVE). 이력 보존을 위해 실삭제는 하지 않는다. */
  @Patch('users/:id')
  async patchUser(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchUserDto) {
    const user = await this.prisma.client.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    await this.prisma.client.user.update({ where: { id }, data: { status: dto.status as never } });
    await this.audit(adminId, 'USER_STATUS', 'User', id, `${user.status}→${dto.status}${dto.reason ? ` (${dto.reason})` : ''}`);
    return { ok: true, status: dto.status };
  }

  // ---------------- 예약 ----------------

  /** 예약 목록 — 상품별 필터 가능 */
  @Get('reservations')
  reservations(@Query('productId') productId?: string) {
    return this.prisma.client.reservation.findMany({
      where: productId ? { productId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { nickname: true } },
        product: { select: { id: true, name: true, merchant: { select: { name: true } } } },
        slot: { select: { startAt: true, endAt: true, capacity: true } },
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

  // ---------------- 상품 · 예약 슬롯 ----------------

  @Get('products')
  products() {
    return this.prisma.client.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: { select: { id: true, name: true } },
        category: { select: { name: true, emoji: true } },
        _count: { select: { slots: true, vouchers: true } },
      },
    });
  }

  @Post('products')
  async createProduct(@AdminId() adminId: string, @Body() dto: CreateProductDto) {
    const merchant = await this.prisma.client.merchant.findUnique({
      where: { id: dto.merchantId },
      select: { categoryId: true, name: true },
    });
    if (!merchant) throw new NotFoundException('가맹점을 찾을 수 없습니다');
    const imageUrl = dto.imageBase64 ? saveImageDataUrl(dto.imageBase64, 'product') : null;
    const p = await this.prisma.client.product.create({
      data: {
        merchantId: dto.merchantId,
        categoryId: merchant.categoryId,
        name: dto.name,
        type: dto.type as never,
        basePrice: dto.basePrice,
        memberPrice: dto.memberPrice ?? null,
        verification: (dto.verification ?? 'QR_ONLY') as never,
        description: dto.description,
        cancelPolicy: dto.cancelPolicy,
        imageUrl,
      },
    });
    await this.audit(adminId, 'PRODUCT_CREATE', 'Product', p.id, `${merchant.name} / ${dto.name}`);
    return p;
  }

  @Patch('products/:id')
  async patchProduct(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchProductDto) {
    const p = await this.prisma.client.product.update({
      where: { id },
      data: {
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
        ...(dto.basePrice != null ? { basePrice: dto.basePrice } : {}),
        ...(dto.memberPrice != null ? { memberPrice: dto.memberPrice } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.imageBase64 ? { imageUrl: saveImageDataUrl(dto.imageBase64, 'product') } : {}),
      },
    });
    await this.audit(adminId, 'PRODUCT_UPDATE', 'Product', id, JSON.stringify(dto));
    return p;
  }

  @Get('products/:id/slots')
  slots(@Param('id') id: string) {
    return this.prisma.client.productSlot.findMany({
      where: { productId: id },
      orderBy: { startAt: 'asc' },
    });
  }

  @Post('products/:id/slots')
  async createSlot(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: CreateSlotDto) {
    const startAt = new Date(dto.startAt);
    if (Number.isNaN(startAt.getTime())) throw new BadRequestException('시작 시각이 올바르지 않습니다');
    const endAt = new Date(startAt.getTime() + dto.durationMinutes * 60_000);
    const slot = await this.prisma.client.productSlot.create({
      data: { productId: id, startAt, endAt, capacity: dto.capacity },
    });
    await this.audit(adminId, 'SLOT_CREATE', 'ProductSlot', slot.id, `${dto.startAt} / ${dto.capacity}명`);
    return slot;
  }

  @Patch('slots/:id')
  async patchSlot(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchSlotDto) {
    const slot = await this.prisma.client.productSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException();
    const data: Record<string, unknown> = {};
    if (dto.isOpen != null) data.isOpen = !!dto.isOpen;
    if (dto.capacity != null) {
      if (dto.capacity < slot.reserved) throw new BadRequestException(`이미 ${slot.reserved}명이 예약해 그 이하로 줄일 수 없습니다`);
      data.capacity = dto.capacity;
    }
    if (dto.startAt) {
      const startAt = new Date(dto.startAt);
      if (Number.isNaN(startAt.getTime())) throw new BadRequestException('시작 시각이 올바르지 않습니다');
      const dur = dto.durationMinutes ?? Math.round((slot.endAt.getTime() - slot.startAt.getTime()) / 60_000);
      data.startAt = startAt;
      data.endAt = new Date(startAt.getTime() + dur * 60_000);
    } else if (dto.durationMinutes != null) {
      data.endAt = new Date(slot.startAt.getTime() + dto.durationMinutes * 60_000);
    }
    const updated = await this.prisma.client.productSlot.update({ where: { id }, data: data as never });
    await this.audit(adminId, 'SLOT_UPDATE', 'ProductSlot', id, JSON.stringify(dto));
    return updated;
  }

  /** 회차 삭제 — 예약이 있으면 삭제 불가(마감 처리 안내) */
  @Delete('slots/:id')
  async deleteSlot(@AdminId() adminId: string, @Param('id') id: string) {
    const slot = await this.prisma.client.productSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException();
    if (slot.reserved > 0) throw new BadRequestException(`예약 ${slot.reserved}건이 있어 삭제할 수 없습니다. 마감 처리하세요`);
    await this.prisma.client.productSlot.delete({ where: { id } });
    await this.audit(adminId, 'SLOT_DELETE', 'ProductSlot', id);
    return { ok: true };
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
