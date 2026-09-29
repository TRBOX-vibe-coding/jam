/**
 * 본사 관리자 API.
 * 대시보드는 "얼마나 가입했는지"보다 실제 거래·사용·재방문을 보여준다.
 * 상태를 바꾸는 모든 행동은 AuditLog에 남긴다.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException,
  Param, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { saveImageDataUrl } from './uploads';
import {
  IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { AdminGuard, AdminId, AuthModule } from './auth';
import { MERCHANT_SCOPE_SELECT, PLAN_SCOPE_SELECT, planGivesMemberPrice, planProductRules, scopeCovers } from './plan-scope.util';
import { parsePeriod, periodKeys, saleState } from './product-period.util';
import { DEFAULT_COMMISSION, feeOf, feeRate } from './fee.util';

/** 수수료율(%) — 빈 값이면 가게 기본으로 돌린다 */
const RATE_OR_EMPTY = /^(\d{1,2}(\.\d{1,2})?)?$/;

/** 'YYYY-MM-DD' 또는 빈 값(지우기) */
const DAY_OR_EMPTY = /^(\d{4}-\d{2}-\d{2})?$/;

class RejectDto {
  @IsString() @MinLength(2) reason!: string;
}
class CreateBenefitDto {
  @IsString() merchantId!: string;
  @IsString() @MinLength(2) title!: string;
  @IsIn(['PERCENT', 'AMOUNT', 'AMOUNT_PER_PERSON', 'FREEBIE']) type!: 'PERCENT' | 'AMOUNT' | 'AMOUNT_PER_PERSON' | 'FREEBIE';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) value?: number;
  @IsOptional() @IsString() freebieName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) companionLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsePerUser?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsePerDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minOrderAmount?: number;
  @IsOptional() @IsString() conditions?: string;
}
class PatchBenefitDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) value?: number;
  @IsOptional() @IsString() freebieName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) companionLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsePerUser?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsePerDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minOrderAmount?: number;
  @IsOptional() @IsString() conditions?: string;
  @IsOptional() isActive?: boolean;
}

class CreateCouponDropDto {
  @IsString() benefitId!: string;
  @IsString({ each: true }) times!: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) qtyPerSlot?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168) validHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440) claimWindowMinutes?: number;
}
class PatchCouponDropDto {
  @IsOptional() @IsString({ each: true }) times?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) qtyPerSlot?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168) validHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440) claimWindowMinutes?: number;
  @IsOptional() isActive?: boolean;
}

/** 혜택 유형별 필수 값 검증 */
function validateBenefitValue(dto: { type: string; value?: number; freebieName?: string }) {
  if (dto.type === 'PERCENT' && (!dto.value || dto.value < 1 || dto.value > 100)) {
    throw new BadRequestException('할인율은 1~100 사이여야 합니다');
  }
  if (dto.type === 'AMOUNT' && (!dto.value || dto.value < 500)) {
    throw new BadRequestException('할인 금액은 500원 이상이어야 합니다');
  }
  if (dto.type === 'FREEBIE' && !dto.freebieName?.trim()) {
    throw new BadRequestException('증정품 이름을 입력해 주세요');
  }
}
class CreateMerchantDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() categoryId!: string;
  @IsString() regionId!: string;
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(30) commissionRate?: number;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000000) avgSpendPerPerson?: number;
  /** 가게 꼬리표 — 예) 러닝코스 (2026-09-24 대표 확정 3-5) */
  @IsOptional() @IsString({ each: true }) @MaxLength(20, { each: true }) tags?: string[];
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
  @IsOptional() @IsString() thumbnailBase64?: string;
  /** 1인 평균 이용금액 — % 쿠폰 예상 절약액 계산 기준 (2026-09-09 픽스) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000000) avgSpendPerPerson?: number;
  /** 가게 꼬리표 — 예) 러닝코스. 보낸 목록으로 통째로 바꾼다 (2026-09-24 대표 확정 3-5) */
  @IsOptional() @IsString({ each: true }) @MaxLength(20, { each: true }) tags?: string[];
}
/** 꼬리표 정리 — 앞뒤 빈칸·#을 떼고, 같은 것은 하나만 */
function cleanTags(tags?: string[]): string[] | undefined {
  if (!tags) return undefined;
  return [...new Set(tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))].slice(0, 10);
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
  @IsOptional() @IsString() imageBase64?: string;
  @IsOptional() @IsString() imageUrl?: string;
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
/** 정산 보류 이유 — 가게 정산 화면에 그대로 보인다 (2026-09-24 대표 확정 2-2 B) */
class HoldSettlementDto {
  @IsString() @MinLength(2) @MaxLength(200) reason!: string;
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
  /** 회원가 — 어느 잼이 받는지는 잼 범위를 따른다 (2026-09-24 대표 확정 3-5 A) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) memberPrice?: number;
  @IsOptional() @IsIn(['QR_ONLY', 'QR_PIN', 'STAFF_CONFIRM']) verification?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() cancelPolicy?: string;
  @IsOptional() @IsString() imageBase64?: string;
  /** 총 판매 수량 — 다 팔리면 저절로 품절. 비우면 무제한 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) totalQty?: number;
  /** 한 사람당 살 수 있는 수량. 비우면 제한 없음 (2026-09-24 대표 확정 3-3) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) maxPerUser?: number;
  /** 판매 기간·이용 기간 'YYYY-MM-DD' — 비우면 제한 없음 (2026-09-19 문서 4-6) */
  @IsOptional() @Matches(DAY_OR_EMPTY) saleFrom?: string;
  @IsOptional() @Matches(DAY_OR_EMPTY) saleTo?: string;
  @IsOptional() @Matches(DAY_OR_EMPTY) useFrom?: string;
  @IsOptional() @Matches(DAY_OR_EMPTY) useTo?: string;
  /** 이 상품의 수수료율(%) — 비우면 가게 기본 (2026-09-29 대표 확정) */
  @IsOptional() @Matches(RATE_OR_EMPTY) commissionRate?: string;
}
class PatchProductDto {
  @IsOptional() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) basePrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) memberPrice?: number;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() imageBase64?: string;
  /** 총 판매 수량. 0이면 무제한으로 돌린다 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) totalQty?: number;
  /** 한 사람당 수량. 0이면 제한 없음으로 돌린다 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) maxPerUser?: number;
  /** 판매 기간·이용 기간 'YYYY-MM-DD' — 빈 값이면 지운다 (2026-09-19 문서 4-6) */
  @IsOptional() @Matches(DAY_OR_EMPTY) saleFrom?: string;
  @IsOptional() @Matches(DAY_OR_EMPTY) saleTo?: string;
  @IsOptional() @Matches(DAY_OR_EMPTY) useFrom?: string;
  @IsOptional() @Matches(DAY_OR_EMPTY) useTo?: string;
  /** 이 상품의 수수료율(%) — 빈 값이면 가게 기본으로 돌린다 (2026-09-29 대표 확정) */
  @IsOptional() @Matches(RATE_OR_EMPTY) commissionRate?: string;
}
/** 수수료율 문자 → 저장할 값. 빈 값은 null(가게 기본), 50%를 넘으면 막는다 */
function parseRate(v: string | undefined): { value?: number | null; error?: string } {
  if (v === undefined) return {};
  if (v === '') return { value: null };
  const n = Number(v);
  if (!(n >= 0 && n <= 50)) return { error: '수수료율은 0~50% 사이로 넣어 주세요' };
  return { value: n };
}
/** 이 상품에 회원가를 주는 잼 — 화면에서 체크한 결과 그대로. 잼 범위와 다른 것만 예외로 남는다 (3-5 A) */
class SetProductMemberPlansDto {
  @IsString({ each: true }) planIds!: string[];
}
/** 결제 상품에 묶어 파는 '근처 할인 쿠폰' 설정 — 슈퍼 관리자 전용 (2026-09-12 대표 확정) */
class SetProductCouponsDto {
  @IsString({ each: true }) benefitIds!: string[];
  /** 쿠폰이 열린 뒤 쓸 수 있는 기간(일). 비우면 기본 90일.
   *  언제 열리는지는 고르지 않는다 — 상품 종류와 손님이 고른 날로 저절로 정해진다 (bundled-coupons.util.ts) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) validDays?: number;
}
class CreateSlotDto {
  @IsString() startAt!: string; // ISO
  @Type(() => Number) @IsInt() @Min(15) @Max(600) durationMinutes!: number;
  /// 비우면 점주가 상품에 정해둔 회차당 기본 정원(defaultCapacity)을 쓴다.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) capacity?: number;
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
    if (dto.imageBase64) data.imageUrl = saveImageDataUrl(dto.imageBase64, 'drop');
    else if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl || null;
    const np = (data.normalPrice as number) ?? drop.normalPrice;
    const dp = (data.dropPrice as number) ?? drop.dropPrice;
    if (dp >= np) throw new BadRequestException('할인가는 정상가보다 낮아야 합니다');
    const updated = await this.prisma.client.drop.update({ where: { id }, data: data as never });
    await this.audit(adminId, 'DROP_UPDATE', 'Drop', id, JSON.stringify({ ...dto, imageBase64: dto.imageBase64 ? '(사진)' : undefined }));
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
        commissionRate: dto.commissionRate ?? DEFAULT_COMMISSION,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        ownerName: dto.ownerName,
        avgSpendPerPerson: dto.avgSpendPerPerson,
        tags: cleanTags(dto.tags) ?? [],
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
        ...(dto.thumbnailBase64 ? { thumbnailUrl: saveImageDataUrl(dto.thumbnailBase64, 'merchant') } : {}),
        ...(dto.avgSpendPerPerson != null ? { avgSpendPerPerson: dto.avgSpendPerPerson } : {}),
        ...(dto.tags ? { tags: cleanTags(dto.tags) } : {}),
      },
    });
    await this.audit(adminId, 'MERCHANT_UPDATE', 'Merchant', id, JSON.stringify({ ...dto, thumbnailBase64: dto.thumbnailBase64 ? '(사진)' : undefined }));
    return m;
  }

  /** 지금 쓰는 가게 꼬리표와 붙은 가게 수 — 꼬리표를 고를 때 보기로 쓴다 */
  @Get('merchant-tags')
  async merchantTags() {
    const rows = await this.prisma.client.merchant.findMany({
      where: { status: { not: 'CLOSED' }, NOT: { tags: { isEmpty: true } } },
      select: { tags: true },
    });
    const count = new Map<string, number>();
    for (const r of rows) for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([tag, merchants]) => ({ tag, merchants }));
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
          createdAt: true, lastLoginAt: true, tags: true,
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
   * 기간 정산 생성 — 가맹점별로 모아 수수료만 떼고 가게 몫을 계산한다 (2026-09-29 대표 확정).
   *  ① 기간 안에 가게에서 사용 처리된 이용권의 판매액
   *  ② 기간 안에 취소하고 남은 돈 — 규정대로 일부만 돌려준 주문의 남은 결제액(예: 하루 전 취소로 남은 50%)
   * 수수료율은 상품에 정해 두면 그것, 없으면 가게 기본(fee.util.ts).
   */
  @Post('settlements/generate')
  async generate(@AdminId() adminId: string, @Body() dto: GenerateSettlementDto) {
    const db = this.prisma.client;
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (!(periodStart < periodEnd)) throw new BadRequestException('기간이 올바르지 않습니다');

    const byMerchant = new Map<string, { gross: number; fee: number; kept: number }>();
    const add = (merchantId: string, amount: number, rate: number, kept: boolean) => {
      const a = byMerchant.get(merchantId) ?? { gross: 0, fee: 0, kept: 0 };
      a.gross += amount;
      a.fee += feeOf(amount, rate);
      if (kept) a.kept += amount;
      byMerchant.set(merchantId, a);
    };

    // ① 가게에서 사용 처리된 이용권
    const used = await db.redemption.findMany({
      where: {
        status: 'DONE', type: 'VOUCHER',
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      include: {
        voucher: { include: { order: { include: { items: true } }, product: { select: { commissionRate: true } } } },
        merchant: { select: { id: true, commissionRate: true } },
      },
    });
    for (const r of used) {
      if (!r.voucher) continue;
      const item = r.voucher.order.items.find((i) => i.productId === r.voucher!.productId);
      add(r.merchantId, item?.amount ?? 0, feeRate(r.voucher.product, r.merchant), false);
    }

    // ② 취소하고 남은 돈 — 가게 몫, 수수료만 뗀다. 환불액을 모르는 옛 취소 건은 넣지 않는다
    const cancelled = await db.order.findMany({
      where: { status: 'CANCELLED', cancelledAt: { gte: periodStart, lt: periodEnd }, refundAmount: { not: null } },
      include: {
        items: { include: { product: { select: { commissionRate: true, merchant: { select: { id: true, commissionRate: true } } } } } },
      },
    });
    for (const o of cancelled) {
      const kept = (o.paidAmount || o.totalAmount) - (o.refundAmount ?? 0);
      const it = o.items.find((i) => i.product);
      if (kept <= 0 || !it?.product) continue; // 잼 주문 등 가게 상품이 아닌 것은 홀릭잼 몫
      add(it.product.merchant.id, kept, feeRate(it.product, it.product.merchant), true);
    }

    const created = [];
    for (const [merchantId, a] of byMerchant) {
      const data = { grossAmount: a.gross, feeAmount: a.fee, netAmount: a.gross - a.fee, cancelKeptAmount: a.kept };
      const row = await db.settlement.upsert({
        where: { merchantId_periodStart_periodEnd: { merchantId, periodStart, periodEnd } },
        update: data,
        create: { merchantId, periodStart, periodEnd, ...data },
      });
      created.push(row);
    }
    await this.audit(adminId, 'SETTLEMENT_GENERATE', 'Settlement', `${dto.periodStart}~${dto.periodEnd}`, `${created.length}건`);
    return { ok: true, count: created.length, settlements: created };
  }

  /**
   * 정산 보류 표시 — 2026-09-24 대표 확정 2-2 B.
   * 돈을 멈추는 건 토스 관리자 화면에서 한다(이 가게 지급요청서를 보내지 않거나, 예약해 둔 요청을 '전송취소').
   * 여기서는 보류했다는 사실과 이유를 남겨 대시보드와 가게 정산 화면에 보이게 한다.
   */
  @Post('settlements/:id/hold')
  async holdSettlement(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: HoldSettlementDto) {
    const s = await this.prisma.client.settlement.findUnique({ where: { id }, include: { merchant: { select: { name: true } } } });
    if (!s) throw new NotFoundException('정산을 찾을 수 없습니다');
    if (s.status === 'PAID') throw new BadRequestException('이미 지급한 정산은 보류할 수 없습니다');
    const row = await this.prisma.client.settlement.update({
      where: { id },
      data: { heldAt: new Date(), holdReason: dto.reason.trim() },
    });
    await this.audit(adminId, 'SETTLEMENT_HOLD', 'Settlement', id, `${s.merchant.name} · ${dto.reason.trim()}`);
    return row;
  }

  /** 보류 풀기 — 토스에서 그 가게 몫을 다시 보낼 때 함께 누른다 */
  @Post('settlements/:id/release')
  async releaseSettlement(@AdminId() adminId: string, @Param('id') id: string) {
    const row = await this.prisma.client.settlement.update({
      where: { id },
      data: { heldAt: null, holdReason: null },
    });
    await this.audit(adminId, 'SETTLEMENT_RELEASE', 'Settlement', id);
    return row;
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
  async products() {
    const db = this.prisma.client;
    const rows = await db.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: { select: { id: true, name: true, commissionRate: true, ...MERCHANT_SCOPE_SELECT } },
        category: { select: { name: true, emoji: true } },
        _count: { select: { slots: true, vouchers: true } },
      },
    });
    // 회원가를 받는 잼 이름 — 잼 범위 + 예외로 계산해 목록에 보여준다 (3-5 A)
    const plans = await db.membershipPlan.findMany({
      where: { price: { gt: 0 } },
      orderBy: { sortOrder: 'asc' },
      select: { ...PLAN_SCOPE_SELECT, name: true },
    });
    const rules = await planProductRules(db, plans.map((p) => p.id), rows.map((r) => r.id));
    return rows.map((r) => ({
      ...r,
      memberPlanNames: plans.filter((pl) => planGivesMemberPrice(pl, r, rules)).map((pl) => pl.name),
      memberPlanExceptions: plans.filter((pl) => rules.has(`${pl.id}:${r.id}`)).length,
      /** 판매 기간·이용 기간 'YYYY-MM-DD' + 판매 상태 (2026-09-19 문서 4-6) */
      period: periodKeys(r),
      saleState: saleState(r),
      /** 적용 수수료율(%) — 상품에 없으면 가게 기본 (2026-09-29 대표 확정) */
      feeRate: feeRate(r, r.merchant),
    }));
  }

  /**
   * 이 상품에 회원가를 주는 잼 — 2026-09-24 대표 확정(3-5 A).
   * 회원가는 잼 범위를 따른다. 여기서는 범위와 다르게 할 잼만 예외로 더하거나 뺀다.
   */
  @Get('products/:id/member-plans')
  async productMemberPlans(@Param('id') id: string) {
    const db = this.prisma.client;
    const product = await db.product.findUnique({
      where: { id },
      select: {
        id: true, name: true, memberPrice: true, basePrice: true,
        merchant: { select: { name: true, ...MERCHANT_SCOPE_SELECT, region: { select: { name: true } }, category: { select: { name: true, emoji: true } } } },
      },
    });
    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다');
    const plans = await db.membershipPlan.findMany({
      where: { price: { gt: 0 } },
      orderBy: { sortOrder: 'asc' },
      select: { ...PLAN_SCOPE_SELECT, code: true, name: true, isActive: true, isPrivate: true },
    });
    const rules = await planProductRules(db, plans.map((p) => p.id), [id]);
    return {
      product,
      plans: plans.map((pl) => {
        const ex = rules.get(`${pl.id}:${id}`);
        return {
          id: pl.id, code: pl.code, name: pl.name, isActive: pl.isActive, isPrivate: pl.isPrivate,
          /** 잼 범위만으로 회원가를 받는지 */
          inScope: scopeCovers(pl, product),
          /** 예외 — 'ADD' 범위 밖인데 준다 / 'REMOVE' 범위 안인데 안 준다 */
          rule: ex === true ? 'REMOVE' : ex === false ? 'ADD' : null,
          gives: planGivesMemberPrice(pl, { ...product, memberPrice: product.memberPrice ?? 0 }, rules),
        };
      }),
    };
  }

  @Put('products/:id/member-plans')
  async setProductMemberPlans(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: SetProductMemberPlansDto) {
    const db = this.prisma.client;
    const product = await db.product.findUnique({
      where: { id },
      select: { id: true, name: true, merchant: { select: MERCHANT_SCOPE_SELECT } },
    });
    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다');
    const plans = await db.membershipPlan.findMany({ where: { price: { gt: 0 } }, select: PLAN_SCOPE_SELECT });
    const wanted = new Set(dto.planIds ?? []);
    let exceptions = 0;
    await db.$transaction(async (tx) => {
      await tx.planProductRule.deleteMany({ where: { productId: id } });
      for (const pl of plans) {
        const want = wanted.has(pl.id);
        if (want === scopeCovers(pl, product)) continue; // 범위대로면 예외를 남기지 않는다
        await tx.planProductRule.create({ data: { planId: pl.id, productId: id, isExcluded: !want } });
        exceptions++;
      }
    });
    await this.audit(adminId, 'PRODUCT_MEMBER_PLANS', 'Product', id, `${product.name} · 회원가 잼 ${wanted.size}개 · 예외 ${exceptions}`);
    return { ok: true, count: wanted.size, exceptions };
  }

  @Post('products')
  async createProduct(@AdminId() adminId: string, @Body() dto: CreateProductDto) {
    const merchant = await this.prisma.client.merchant.findUnique({
      where: { id: dto.merchantId },
      select: { categoryId: true, name: true },
    });
    if (!merchant) throw new NotFoundException('가맹점을 찾을 수 없습니다');
    const period = parsePeriod(dto, dto.type);
    if (period.error) throw new BadRequestException(period.error);
    const rate = parseRate(dto.commissionRate);
    if (rate.error) throw new BadRequestException(rate.error);
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
        // 예약 상품은 회차 정원으로 막히므로 총 수량은 티켓·PASS에만
        totalQty: dto.type !== 'RESERVATION' ? dto.totalQty ?? null : null,
        maxPerUser: dto.maxPerUser ?? null,
        ...period.data,
        commissionRate: rate.value ?? null,
        imageUrl,
      },
    });
    await this.audit(adminId, 'PRODUCT_CREATE', 'Product', p.id, `${merchant.name} / ${dto.name}`);
    return p;
  }

  @Patch('products/:id')
  async patchProduct(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchProductDto) {
    const cur = await this.prisma.client.product.findUnique({
      where: { id },
      select: {
        totalQty: true, soldQty: true, isActive: true, approval: true, type: true,
        saleFrom: true, saleTo: true, useFrom: true, useTo: true,
      },
    });
    if (!cur) throw new NotFoundException('상품을 찾을 수 없습니다');
    // 판매 기간·이용 기간 — 보낸 칸만 바꾼다
    const period = parsePeriod(dto, cur.type, cur);
    if (period.error) throw new BadRequestException(period.error);
    // 수수료율 — 빈 값이면 가게 기본으로
    const rate = parseRate(dto.commissionRate);
    if (rate.error) throw new BadRequestException(rate.error);

    // 총 판매 수량 — 0이면 무제한. 이미 판 것보다 줄일 수는 없다.
    const qty: { totalQty?: number | null; isActive?: boolean } = {};
    if (dto.totalQty != null) {
      const totalQty = dto.totalQty === 0 ? null : dto.totalQty;
      if (totalQty != null && totalQty < cur.soldQty) {
        throw new BadRequestException(`이미 ${cur.soldQty}개가 팔려서 그보다 줄일 수 없습니다`);
      }
      qty.totalQty = totalQty;
      const wasSoldOut = cur.totalQty != null && cur.soldQty >= cur.totalQty;
      if (totalQty != null && totalQty === cur.soldQty) qty.isActive = false; // 딱 다 팔린 수량이면 품절
      else if (wasSoldOut && !cur.isActive && cur.approval === 'ACTIVE') qty.isActive = true; // 품절이었는데 수량이 늘면 다시 판매
    }

    const p = await this.prisma.client.product.update({
      where: { id },
      data: {
        ...qty,
        ...period.data,
        ...(rate.value !== undefined ? { commissionRate: rate.value } : {}),
        ...(dto.maxPerUser != null ? { maxPerUser: dto.maxPerUser === 0 ? null : dto.maxPerUser } : {}),
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

  /** 상품 복사 — 같은 업체 상품을 매번 처음부터 입력하지 않게 (2026-09-12 대표 요청). 
   *  설정과 묶인 쿠폰까지 그대로 가져오고, 판매는 꺼둔 채로 만든다.
   *  회차(날짜·시간)는 상품마다 다르므로 복사하지 않는다. */
  @Post('products/:id/duplicate')
  async duplicateProduct(@AdminId() adminId: string, @Param('id') id: string) {
    const db = this.prisma.client;
    const src = await db.product.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('상품을 찾을 수 없습니다');

    const copy = await db.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          merchantId: src.merchantId,
          categoryId: src.categoryId,
          campaignId: src.campaignId,
          type: src.type,
          name: `${src.name} (복사본)`,
          description: src.description,
          imageUrl: src.imageUrl,
          basePrice: src.basePrice,
          memberPrice: src.memberPrice,
          verification: src.verification,
          totalQty: src.totalQty,
          maxPerUser: src.maxPerUser,
          commissionRate: src.commissionRate,
          saleFrom: src.saleFrom,
          saleTo: src.saleTo,
          useFrom: src.useFrom,
          useTo: src.useTo,
          defaultCapacity: src.defaultCapacity,
          weatherDependent: src.weatherDependent,
          cancelPolicy: src.cancelPolicy,
          i18n: (src as any).i18n ?? undefined,
          approval: 'ACTIVE',
          // 값을 고치기 전에 팔리면 안 되니 판매는 꺼둔 채로 만든다
          isActive: false,
        },
      });
      // 묶어둔 근처 할인 쿠폰도 같이 가져온다
      const rules = await tx.benefitGrantRule.findMany({
        where: { trigger: 'PRODUCT', productId: id },
        orderBy: { sortOrder: 'asc' },
      });
      for (const r of rules) {
        await tx.benefitGrantRule.create({
          data: {
            benefitId: r.benefitId,
            trigger: 'PRODUCT',
            productId: p.id,
            validDays: r.validDays,
            sortOrder: r.sortOrder,
            isActive: r.isActive,
          },
        });
      }
      // 회원가 예외도 같이 가져온다 (3-5 A)
      const planRules = await tx.planProductRule.findMany({ where: { productId: id } });
      for (const r of planRules) {
        await tx.planProductRule.create({ data: { planId: r.planId, productId: p.id, isExcluded: r.isExcluded } });
      }
      return { product: p, copiedCoupons: rules.length };
    });

    await this.audit(adminId, 'DUPLICATE_PRODUCT', 'Product', copy.product.id, `${src.name} 복사`);
    return {
      ok: true,
      id: copy.product.id,
      copiedCoupons: copy.copiedCoupons,
      message: '복사했습니다. 내용을 고친 뒤 판매를 시작하세요.',
    };
  }

  // ---------------- 상품에 묶는 근처 할인 쿠폰 ----------------
  // 점주는 손댈 수 없다. 자기 상품과 판매 가격까지만 (2026-09-12 대표 확정).

  @Get('products/:id/coupons')
  async productCoupons(@Param('id') id: string) {
    const db = this.prisma.client;
    const product = await db.product.findUnique({
      where: { id },
      select: { id: true, name: true, type: true, merchant: { select: { id: true, name: true, regionId: true } } },
    });
    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다');

    const merchantSel = {
      id: true, name: true, thumbnailUrl: true, regionId: true, categoryId: true,
      region: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, emoji: true } },
    };
    const [linked, candidates] = await Promise.all([
      db.benefitGrantRule.findMany({
        where: { trigger: 'PRODUCT', productId: id },
        orderBy: { sortOrder: 'asc' },
        include: { benefit: { include: { merchant: { select: merchantSel } } } },
      }),
      // 후보는 전체 쿠폰(2026-09-19 문서 4-4, 대표 확정). 예) 카페 투어 상품에 부산 전 지역의 카페 쿠폰.
      // 자기 매장 쿠폰을 스스로 묶는 건 의미가 없어서 뺀다.
      db.benefit.findMany({
        where: {
          isActive: true, approval: 'ACTIVE',
          merchant: { status: 'ACTIVE', id: { not: product.merchant.id } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: { merchant: { select: merchantSel } },
      }),
    ]);
    // 같은 지역 쿠폰을 목록 위쪽에 먼저 (그 안에서는 최근 순서 그대로)
    const same = (b: { merchant: { regionId: string } }) => (b.merchant.regionId === product.merchant.regionId ? 1 : 0);
    candidates.sort((a, b) => same(b) - same(a));
    return { product, productRegionId: product.merchant.regionId, validDays: linked[0]?.validDays ?? null, linked, candidates };
  }

  @Post('products/:id/coupons')
  async setProductCoupons(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: SetProductCouponsDto) {
    const db = this.prisma.client;
    const product = await db.product.findUnique({ where: { id }, select: { name: true } });
    if (!product) throw new NotFoundException('상품을 찾을 수 없습니다');
    const ids = [...new Set(dto.benefitIds ?? [])];
    if (ids.length > 10) throw new BadRequestException('한 상품에 최대 10장까지 묶을 수 있습니다');

    await db.$transaction(async (tx) => {
      await tx.benefitGrantRule.deleteMany({ where: { trigger: 'PRODUCT', productId: id } });
      for (let i = 0; i < ids.length; i++) {
        await tx.benefitGrantRule.create({
          data: {
            benefitId: ids[i], trigger: 'PRODUCT', productId: id,
            validDays: dto.validDays ?? null, sortOrder: i, isActive: true,
          },
        });
      }
    });
    await this.audit(adminId, 'SET_PRODUCT_COUPONS', 'Product', id, `${product.name} · ${ids.length}장`);
    return { ok: true, count: ids.length };
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
    const product = await this.prisma.client.product.findUnique({ where: { id }, select: { defaultCapacity: true } });
    const capacity = dto.capacity ?? product?.defaultCapacity ?? null;
    if (capacity == null) throw new BadRequestException('정원을 입력해 주세요 (점주가 정해둔 기본 정원이 없는 상품입니다)');
    const slot = await this.prisma.client.productSlot.create({
      data: { productId: id, startAt, endAt, capacity },
    });
    await this.audit(adminId, 'SLOT_CREATE', 'ProductSlot', slot.id, `${dto.startAt} / ${capacity}명`);
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

  /** 점주가 제출한 상품 승인 → 판매 시작 */
  @Post('products/:id/approve')
  async approveProduct(@AdminId() adminId: string, @Param('id') id: string) {
    const p = await this.prisma.client.product.findUnique({ where: { id }, include: { merchant: { select: { name: true } } } });
    if (!p) throw new NotFoundException();
    const updated = await this.prisma.client.product.update({
      where: { id },
      data: { approval: 'ACTIVE', isActive: true, rejectReason: null },
    });
    await this.audit(adminId, 'PRODUCT_APPROVE', 'Product', id, `${p.merchant.name} / ${p.name}`);
    return { ok: true, status: updated.approval };
  }

  /** 점주가 제출한 상품 반려 */
  @Post('products/:id/reject')
  async rejectProduct(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: RejectDto) {
    const p = await this.prisma.client.product.update({
      where: { id },
      data: { approval: 'REJECTED', isActive: false, rejectReason: dto.reason },
    });
    await this.audit(adminId, 'PRODUCT_REJECT', 'Product', id, dto.reason);
    return { ok: true, status: p.approval };
  }

  // ---------------- 혜택(상시 할인쿠폰) ----------------

  /**
   * 혜택을 멤버십 회원에게 여는 공통 처리.
   * ① 모든 멤버십 플랜에 지급 규칙을 걸고 ② 이미 유효한 멤버십 보유자에게도 즉시 지급한다.
   * (규칙은 원래 구매 시점에만 실행되므로, 나중에 만든 혜택은 기존 회원에게 여기서 열어준다)
   */
  private async openBenefitToMembers(benefitId: string) {
    const db = this.prisma.client;
    const now = new Date();
    const plans = await db.membershipPlan.findMany({ where: { isActive: true }, select: { id: true } });
    for (const plan of plans) {
      const exists = await db.benefitGrantRule.findFirst({
        where: { benefitId, trigger: 'MEMBERSHIP_PLAN', membershipPlanId: plan.id },
      });
      if (!exists) {
        await db.benefitGrantRule.create({
          data: { benefitId, trigger: 'MEMBERSHIP_PLAN', membershipPlanId: plan.id },
        });
      }
    }
    const activeMemberships = await db.userMembership.findMany({
      where: { endAt: { gt: now } },
      select: { id: true, userId: true, endAt: true },
    });
    for (const ms of activeMemberships) {
      await db.userBenefit.upsert({
        where: {
          userId_benefitId_sourceType_sourceId: {
            userId: ms.userId, benefitId, sourceType: 'MEMBERSHIP_PLAN', sourceId: ms.id,
          },
        },
        update: {},
        create: {
          userId: ms.userId, benefitId, sourceType: 'MEMBERSHIP_PLAN', sourceId: ms.id,
          validFrom: now, validTo: ms.endAt,
        },
      });
    }
    return activeMemberships.length;
  }

  @Get('benefits')
  benefits(@Query('status') status?: string) {
    return this.prisma.client.benefit.findMany({
      where: status ? { approval: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        merchant: { select: { id: true, name: true } },
        _count: { select: { userBenefits: true } },
      },
    });
  }

  /** 본사 직접 등록 — 즉시 활성화되고 유효한 멤버십 보유자에게 바로 열린다 */
  @Post('benefits')
  async createBenefit(@AdminId() adminId: string, @Body() dto: CreateBenefitDto) {
    const merchant = await this.prisma.client.merchant.findUnique({
      where: { id: dto.merchantId }, select: { name: true },
    });
    if (!merchant) throw new NotFoundException('가맹점을 찾을 수 없습니다');
    validateBenefitValue(dto);
    const b = await this.prisma.client.benefit.create({
      data: {
        merchantId: dto.merchantId,
        title: dto.title.trim(),
        type: dto.type as never,
        value: dto.type === 'FREEBIE' ? 0 : dto.value!,
        freebieName: dto.type === 'FREEBIE' ? dto.freebieName!.trim() : null,
        companionLimit: dto.companionLimit ?? null,
        maxUsePerUser: dto.maxUsePerUser ?? null,
        maxUsePerDay: dto.maxUsePerDay ?? null,
        minOrderAmount: dto.minOrderAmount ?? null,
        conditions: dto.conditions?.trim() || null,
        approval: 'ACTIVE',
        isActive: true,
      },
    });
    const granted = await this.openBenefitToMembers(b.id);
    await this.audit(adminId, 'BENEFIT_CREATE', 'Benefit', b.id, `${merchant.name} / ${dto.title} (기존 회원 ${granted}명에게 지급)`);
    return { ...b, grantedMembers: granted };
  }

  /** 점주 제출 혜택 승인 → 멤버십 회원에게 즉시 오픈 */
  @Post('benefits/:id/approve')
  async approveBenefit(@AdminId() adminId: string, @Param('id') id: string) {
    const b = await this.prisma.client.benefit.findUnique({ where: { id }, include: { merchant: { select: { name: true } } } });
    if (!b) throw new NotFoundException();
    await this.prisma.client.benefit.update({
      where: { id },
      data: { approval: 'ACTIVE', isActive: true, rejectReason: null },
    });
    const granted = await this.openBenefitToMembers(id);
    await this.audit(adminId, 'BENEFIT_APPROVE', 'Benefit', id, `${b.merchant.name} / ${b.title} (기존 회원 ${granted}명에게 지급)`);
    return { ok: true, grantedMembers: granted };
  }

  /** 점주 제출 혜택 반려 */
  @Post('benefits/:id/reject')
  async rejectBenefit(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: RejectDto) {
    await this.prisma.client.benefit.update({
      where: { id },
      data: { approval: 'REJECTED', isActive: false, rejectReason: dto.reason },
    });
    await this.audit(adminId, 'BENEFIT_REJECT', 'Benefit', id, dto.reason);
    return { ok: true };
  }

  @Patch('benefits/:id')
  async patchBenefit(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchBenefitDto) {
    const data: Record<string, unknown> = {};
    if (dto.title) data.title = dto.title.trim();
    if (dto.value != null) data.value = dto.value;
    if (dto.freebieName !== undefined) data.freebieName = dto.freebieName?.trim() || null;
    if (dto.companionLimit !== undefined) data.companionLimit = dto.companionLimit;
    if (dto.maxUsePerUser !== undefined) data.maxUsePerUser = dto.maxUsePerUser;
    if (dto.maxUsePerDay !== undefined) data.maxUsePerDay = dto.maxUsePerDay;
    if (dto.minOrderAmount !== undefined) data.minOrderAmount = dto.minOrderAmount;
    if (dto.conditions !== undefined) data.conditions = dto.conditions?.trim() || null;
    if (dto.isActive != null) data.isActive = dto.isActive;
    const b = await this.prisma.client.benefit.update({ where: { id }, data: data as never });
    await this.audit(adminId, 'BENEFIT_UPDATE', 'Benefit', id, JSON.stringify(dto));
    return b;
  }

  /** 혜택 삭제 — 지급 이력이 있으면 중지 처리로 전환 */
  @Delete('benefits/:id')
  async deleteBenefit(@AdminId() adminId: string, @Param('id') id: string) {
    const b = await this.prisma.client.benefit.findUnique({
      where: { id },
      include: { _count: { select: { userBenefits: true } } },
    });
    if (!b) throw new NotFoundException();
    if (b._count.userBenefits > 0) {
      await this.prisma.client.benefit.update({ where: { id }, data: { isActive: false } });
      await this.audit(adminId, 'BENEFIT_DEACTIVATE', 'Benefit', id, `지급 ${b._count.userBenefits}건 존재 → 중지 처리`);
      return { ok: true, mode: 'deactivated', message: '이미 지급된 회원이 있어 중지 처리했습니다' };
    }
    await this.prisma.client.benefit.delete({ where: { id } });
    await this.audit(adminId, 'BENEFIT_DELETE', 'Benefit', id, b.title);
    return { ok: true, mode: 'deleted' };
  }

  // ---------------- 타임 쿠폰 드롭 ----------------

  @Get('coupon-drops')
  async couponDrops() {
    const db = this.prisma.client;
    const rows = await db.couponDrop.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        benefit: { select: { id: true, title: true, merchant: { select: { name: true } } } },
        _count: { select: { claims: true } },
      },
    });
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const out = [];
    for (const r of rows) {
      const todayClaims = await db.couponClaim.count({
        where: { couponDropId: r.id, createdAt: { gte: t0 } },
      });
      out.push({ ...r, todayClaims });
    }
    return out;
  }

  @Post('coupon-drops')
  async createCouponDrop(@AdminId() adminId: string, @Body() dto: CreateCouponDropDto) {
    const benefit = await this.prisma.client.benefit.findUnique({
      where: { id: dto.benefitId },
      select: { title: true, merchant: { select: { name: true } } },
    });
    if (!benefit) throw new NotFoundException('혜택을 찾을 수 없습니다');
    for (const t of dto.times) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new BadRequestException(`시각 형식이 올바르지 않습니다: ${t} (예: 09:00)`);
    }
    const d = await this.prisma.client.couponDrop.create({
      data: {
        benefitId: dto.benefitId,
        times: dto.times,
        qtyPerSlot: dto.qtyPerSlot ?? 30,
        validHours: dto.validHours ?? 24,
        claimWindowMinutes: dto.claimWindowMinutes ?? 60,
      },
    });
    await this.audit(adminId, 'COUPON_DROP_CREATE', 'CouponDrop', d.id, `${benefit.merchant.name} / ${benefit.title} @ ${dto.times.join(',')}`);
    return d;
  }

  @Patch('coupon-drops/:id')
  async patchCouponDrop(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchCouponDropDto) {
    if (dto.times) {
      for (const t of dto.times) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new BadRequestException(`시각 형식이 올바르지 않습니다: ${t}`);
      }
    }
    const d = await this.prisma.client.couponDrop.update({
      where: { id },
      data: {
        ...(dto.times ? { times: dto.times } : {}),
        ...(dto.qtyPerSlot != null ? { qtyPerSlot: dto.qtyPerSlot } : {}),
        ...(dto.validHours != null ? { validHours: dto.validHours } : {}),
        ...(dto.claimWindowMinutes != null ? { claimWindowMinutes: dto.claimWindowMinutes } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit(adminId, 'COUPON_DROP_UPDATE', 'CouponDrop', id, JSON.stringify(dto));
    return d;
  }

  @Delete('coupon-drops/:id')
  async deleteCouponDrop(@AdminId() adminId: string, @Param('id') id: string) {
    await this.prisma.client.couponDrop.delete({ where: { id } });
    await this.audit(adminId, 'COUPON_DROP_DELETE', 'CouponDrop', id);
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
