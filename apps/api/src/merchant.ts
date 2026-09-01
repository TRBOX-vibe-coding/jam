/**
 * 가맹점 모드 — "점주가 필요할 때 보는 관리 화면".
 * 일반 직원용 시스템은 없다. 현장 사용은 손님 스캔으로 끝나고,
 * 점주는 앱의 가맹점 모드에서 사용내역·DROP·정산만 확인한다.
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { saveImageDataUrl } from './uploads';
import { AuthModule, UserGuard, UserId } from './auth';

class CreateDropDto {
  @IsString() @MinLength(4) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(['DEAL', 'TICKET']) kind!: 'DEAL' | 'TICKET';
  @Type(() => Number) @IsInt() @Min(1000) normalPrice!: number;
  @Type(() => Number) @IsInt() @Min(100) dropPrice!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(500) totalQty!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10) personsPerUnit!: number;
  @IsString() openAt!: string;
  @IsString() closeAt!: string;
  @IsOptional() @Type(() => Number) @IsInt() usableFromMinute?: number;
  @IsOptional() @Type(() => Number) @IsInt() usableToMinute?: number;
  @IsOptional() @IsString() productId?: string;
  /// 상품 사진(data URL). 손님 목록·상세와 본사 승인 화면에 그대로 노출된다.
  @IsOptional() @IsString() imageBase64?: string;
}

class VerifyDto {
  @IsString() @MinLength(4) token!: string;
}

class CreateMerchantProductDto {
  @IsIn(['TICKET', 'RESERVATION']) type!: 'TICKET' | 'RESERVATION';
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(1000) basePrice!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) memberPrice?: number;
  @IsOptional() @IsIn(['QR_ONLY', 'QR_PIN']) verification?: string;
  @IsOptional() @IsString() cancelPolicy?: string;
  @IsOptional() @IsString() imageBase64?: string;
}

class CreateMerchantBenefitDto {
  @IsString() @MinLength(2) title!: string;
  @IsIn(['PERCENT', 'AMOUNT', 'FREEBIE']) type!: 'PERCENT' | 'AMOUNT' | 'FREEBIE';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) value?: number;
  @IsOptional() @IsString() freebieName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) companionLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsePerUser?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsePerDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minOrderAmount?: number;
  @IsOptional() @IsString() conditions?: string;
}

/** 혜택 입력값 공통 검증 — 유형별 필수 값을 확인한다 */
function validateBenefitInput(dto: { type: string; value?: number; freebieName?: string }) {
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

class ApplyDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() regionId!: string;
  @IsString() categoryId!: string;
  @IsString() @MinLength(5) address!: string;
  /// 사업자등록번호 10자리. 하이픈은 넣어도 되고 안 넣어도 된다. 등록증 사본은 승인 단계에서 확인.
  @IsString() @Matches(/^\d{3}-?\d{2}-?\d{5}$/, { message: '사업자등록번호는 10자리 숫자여야 합니다' }) bizRegNo!: string;
  @IsString() @MinLength(2) ownerName!: string;
  @IsString() @Matches(/^01[016789]-?\d{3,4}-?\d{4}$/, { message: '연락처 형식이 올바르지 않습니다' }) contactPhone!: string;
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다' }) contactEmail!: string;
  @IsOptional() @IsString() intro?: string;
}

@Controller('merchant')
@UseGuards(UserGuard)
export class MerchantController {
  constructor(private prisma: PrismaService) {}

  private async myMerchant(userId: string) {
    const m = await this.prisma.client.merchant.findFirst({
      where: { ownerUserId: userId },
      include: {
        region: { select: { name: true } },
        category: { select: { name: true } },
        qrCodes: { where: { isActive: true } },
      },
    });
    if (!m) throw new ForbiddenException('가맹점 계정이 아닙니다');
    return m;
  }

  /**
   * 입점 신청 — 사장님도 손님과 똑같이 카카오로 로그인한 뒤,
   * 여기서 가게 정보를 제출하면 PENDING 상태로 등록되고 본사 승인 시 가맹점 모드가 열린다.
   */
  @Post('apply')
  async apply(@UserId() userId: string, @Body() dto: ApplyDto) {
    const db = this.prisma.client;
    const existing = await db.merchant.findFirst({ where: { ownerUserId: userId } });
    if (existing) {
      throw new BadRequestException(
        existing.status === 'PENDING'
          ? '이미 입점 신청이 접수되어 승인 대기 중입니다'
          : '이미 연결된 가게가 있습니다',
      );
    }
    const merchant = await db.merchant.create({
      data: {
        name: dto.name.trim(),
        regionId: dto.regionId,
        categoryId: dto.categoryId,
        address: dto.address.trim(),
        bizRegNo: dto.bizRegNo.replace(/-/g, ''),
        ownerName: dto.ownerName.trim(),
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail.trim(),
        intro: dto.intro,
        ownerUserId: userId,
        status: 'PENDING',
      },
    });
    return {
      ok: true,
      merchantId: merchant.id,
      message: '입점 신청이 접수되었습니다. 본사 승인 후 가맹점 모드가 열립니다.',
    };
  }

  @Get('my')
  async my(@UserId() userId: string) {
    const m = await this.myMerchant(userId);
    return {
      id: m.id, name: m.name, status: m.status,
      region: m.region.name, category: m.category.name,
      address: m.address, commissionRate: m.commissionRate,
      qrCodes: m.qrCodes.map((q) => ({ id: q.id, code: q.code, label: q.label })),
    };
  }

  /** 오늘/이번달 사용 현황 요약 */
  @Get('my/summary')
  async summary(@UserId() userId: string) {
    const m = await this.myMerchant(userId);
    const db = this.prisma.client;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const [today, month, openDrops] = await Promise.all([
      db.redemption.count({ where: { merchantId: m.id, status: 'DONE', createdAt: { gte: todayStart } } }),
      db.redemption.count({ where: { merchantId: m.id, status: 'DONE', createdAt: { gte: monthStart } } }),
      db.drop.findMany({
        where: { merchantId: m.id, status: { in: ['OPEN', 'SOLD_OUT', 'PENDING', 'SCHEDULED'] } },
        select: { id: true, title: true, status: true, remainingQty: true, totalQty: true, closeAt: true },
        orderBy: { closeAt: 'asc' },
      }),
    ]);
    return { merchantName: m.name, todayRedemptions: today, monthRedemptions: month, drops: openDrops };
  }

  /** 사용내역 (기본 오늘) */
  @Get('my/redemptions')
  async redemptions(@UserId() userId: string, @Query('days') days?: string) {
    const m = await this.myMerchant(userId);
    const since = new Date();
    since.setDate(since.getDate() - (Number(days) || 1));
    since.setHours(0, 0, 0, 0);
    return this.prisma.client.redemption.findMany({
      where: { merchantId: m.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { nickname: true } },
        userBenefit: { include: { benefit: { select: { title: true } } } },
        dropClaim: { include: { drop: { select: { title: true } } } },
        voucher: { include: { product: { select: { name: true } } } },
      },
    });
  }

  /** DROP 등록 요청 → 본사 승인 대기 */
  @Post('my/drops')
  async createDrop(@UserId() userId: string, @Body() dto: CreateDropDto) {
    const m = await this.myMerchant(userId);
    if (dto.dropPrice >= dto.normalPrice) {
      throw new BadRequestException('할인가는 정상가보다 낮아야 합니다');
    }
    const openAt = new Date(dto.openAt);
    const closeAt = new Date(dto.closeAt);
    if (!(openAt < closeAt)) throw new BadRequestException('기간이 올바르지 않습니다');

    const imageUrl = dto.imageBase64 ? saveImageDataUrl(dto.imageBase64, 'drop') : null;

    const merchant = await this.prisma.client.merchant.findUniqueOrThrow({
      where: { id: m.id }, select: { regionId: true, categoryId: true },
    });

    const drop = await this.prisma.client.drop.create({
      data: {
        merchantId: m.id,
        regionId: merchant.regionId,
        categoryId: merchant.categoryId,
        productId: dto.productId ?? null,
        kind: dto.kind,
        status: 'PENDING',
        title: dto.title,
        description: dto.description,
        imageUrl,
        normalPrice: dto.normalPrice,
        dropPrice: dto.dropPrice,
        totalQty: dto.totalQty,
        remainingQty: dto.totalQty,
        personsPerUnit: dto.personsPerUnit,
        openAt, closeAt,
        usableFromMinute: dto.usableFromMinute ?? null,
        usableToMinute: dto.usableToMinute ?? null,
      },
    });
    return { ok: true, dropId: drop.id, status: drop.status, message: '등록 요청 완료. 본사 승인 후 오픈됩니다.' };
  }

  @Get('my/drops')
  async myDrops(@UserId() userId: string) {
    const m = await this.myMerchant(userId);
    return this.prisma.client.drop.findMany({
      where: { merchantId: m.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * 상품 등록 요청 (티켓·예약형) → 본사 승인 후 판매 시작.
   * 야놀자·여기어때처럼 점주 셀프 등록이 기본이고, 품질은 승인 단계에서 거른다.
   */
  @Post('my/products')
  async createProduct(@UserId() userId: string, @Body() dto: CreateMerchantProductDto) {
    const m = await this.myMerchant(userId);
    if (dto.memberPrice != null && dto.memberPrice >= dto.basePrice) {
      throw new BadRequestException('멤버십가는 정상가보다 낮아야 합니다');
    }
    const imageUrl = dto.imageBase64 ? saveImageDataUrl(dto.imageBase64, 'product') : null;
    const p = await this.prisma.client.product.create({
      data: {
        merchantId: m.id,
        categoryId: m.categoryId,
        type: dto.type,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        basePrice: dto.basePrice,
        memberPrice: dto.memberPrice ?? null,
        verification: (dto.verification ?? 'QR_ONLY') as never,
        cancelPolicy: dto.cancelPolicy?.trim() || null,
        imageUrl,
        approval: 'PENDING',
        isActive: false,
      },
    });
    return { ok: true, productId: p.id, message: '등록 요청 완료. 본사 승인 후 판매가 시작됩니다.' };
  }

  /** 내가 등록한 상품 (승인 대기·반려 포함) */
  @Get('my/products')
  async myProducts(@UserId() userId: string) {
    const m = await this.myMerchant(userId);
    return this.prisma.client.product.findMany({
      where: { merchantId: m.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { slots: true } } },
    });
  }

  /** 혜택(할인쿠폰) 등록 요청 → 본사 승인 후 멤버십 회원에게 열린다 */
  @Post('my/benefits')
  async createBenefit(@UserId() userId: string, @Body() dto: CreateMerchantBenefitDto) {
    const m = await this.myMerchant(userId);
    validateBenefitInput(dto);
    const b = await this.prisma.client.benefit.create({
      data: {
        merchantId: m.id,
        title: dto.title.trim(),
        type: dto.type,
        value: dto.type === 'FREEBIE' ? 0 : dto.value!,
        freebieName: dto.type === 'FREEBIE' ? dto.freebieName!.trim() : null,
        companionLimit: dto.companionLimit ?? null,
        maxUsePerUser: dto.maxUsePerUser ?? null,
        maxUsePerDay: dto.maxUsePerDay ?? null,
        minOrderAmount: dto.minOrderAmount ?? null,
        conditions: dto.conditions?.trim() || null,
        approval: 'PENDING',
        isActive: false,
      },
    });
    return { ok: true, benefitId: b.id, message: '등록 요청 완료. 본사 승인 후 멤버십 회원에게 열립니다.' };
  }

  /** 내가 등록한 혜택 (승인 대기·반려 포함) */
  @Get('my/benefits')
  async myBenefits(@UserId() userId: string) {
    const m = await this.myMerchant(userId);
    return this.prisma.client.benefit.findMany({
      where: { merchantId: m.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** 정산 내역 */
  @Get('my/settlements')
  async settlements(@UserId() userId: string) {
    const m = await this.myMerchant(userId);
    return this.prisma.client.settlement.findMany({
      where: { merchantId: m.id },
      orderBy: { periodEnd: 'desc' },
      take: 24,
    });
  }

  /**
   * 완료화면 검증 — 고가 상품(QR_PIN)일 때 직원이 손님 화면의 6자리 토큰을 조회.
   * 90초 안에서만 유효하고, 이 매장 건만 조회된다.
   */
  @Post('verify')
  async verify(@UserId() userId: string, @Body() dto: VerifyDto) {
    const m = await this.myMerchant(userId);
    const r = await this.prisma.client.redemption.findUnique({
      where: { verifyToken: dto.token.toUpperCase() },
      include: {
        user: { select: { nickname: true } },
        voucher: { include: { product: { select: { name: true } } } },
        dropClaim: { include: { drop: { select: { title: true } } } },
        userBenefit: { include: { benefit: { select: { title: true } } } },
      },
    });
    if (!r || r.merchantId !== m.id) throw new NotFoundException('확인할 수 없는 코드입니다');
    const expired = r.verifyExpires < new Date();
    return {
      valid: !expired && r.status === 'DONE',
      expired,
      usedAt: r.createdAt,
      headcount: r.headcount,
      customer: r.user.nickname,
      item:
        r.voucher?.product.name ?? r.dropClaim?.drop.title ?? r.userBenefit?.benefit.title ?? '',
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [MerchantController],
  providers: [PrismaService],
})
export class MerchantModule {}
