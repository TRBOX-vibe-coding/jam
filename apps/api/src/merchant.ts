/**
 * 가맹점 모드 — "점주가 필요할 때 보는 관리 화면".
 * 일반 직원용 시스템은 없다. 현장 사용은 손님 스캔으로 끝나고,
 * 점주는 앱의 가맹점 모드에서 사용내역·DROP·정산만 확인한다.
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import * as XLSX from 'xlsx';
import { PrismaService } from './prisma.service';
import { saveImageDataUrl } from './uploads';
import { AuthModule, UserGuard, UserId } from './auth';

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

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

class SetPinDto {
  /** 자릿수는 점주 자유 (2~10자, 숫자·영문) */
  @IsString() @MinLength(2) @MaxLength(10) pin!: string;
}

class SetQtyDto {
  /** 새 총 수량 — 남은 수량은 판매분을 유지한 채 자동 재계산 (2026-09-10 픽스: 점주가 직접 조정) */
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) totalQty!: number;
}

class CreateMerchantProductDto {
  @IsIn(['TICKET', 'RESERVATION']) type!: 'TICKET' | 'RESERVATION';
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(1000) basePrice!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) memberPrice?: number;
  /** 할인가를 받는 잼. 비우면 유료 잼이면 모두 (2026-09-18 대표 확정) */
  @IsOptional() @IsString({ each: true }) memberPricePlanIds?: string[];
  @IsOptional() @IsIn(['QR_ONLY', 'QR_PIN']) verification?: string;
  @IsOptional() @IsString() cancelPolicy?: string;
  @IsOptional() @IsString() imageBase64?: string;
  /// 티켓형: 총 판매 수량(비우면 무제한). 소진되면 자동 품절.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) totalQty?: number;
  /// 예약형: 회차당 기본 정원 — 본사가 회차를 만들 때 기본값으로 쓴다.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) slotCapacity?: number;
}

class CreateMerchantBenefitDto {
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
      usePin: m.usePin,
      qrCodes: m.qrCodes.map((q) => ({ id: q.id, code: q.code, label: q.label })),
    };
  }

  /** 사용 확인 코드 설정 — 결제 상품을 QR 없이 사용 처리할 때 손님이 입력하는 코드 (2026-09-08 픽스: 점주가 직접 정한다) */
  @Post('my/pin')
  async setPin(@UserId() userId: string, @Body() dto: SetPinDto) {
    const m = await this.myMerchant(userId);
    const pin = dto.pin.trim();
    await this.prisma.client.merchant.update({ where: { id: m.id }, data: { usePin: pin } });
    return { ok: true, usePin: pin, message: '사용 확인 코드를 저장했습니다. 직원분들께 공유해 주세요.' };
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
        select: { id: true, title: true, status: true, remainingQty: true, totalQty: true, openAt: true, closeAt: true },
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
        memberPricePlanIds: dto.memberPricePlanIds ?? [],
        verification: (dto.verification ?? 'QR_ONLY') as never,
        cancelPolicy: dto.cancelPolicy?.trim() || null,
        imageUrl,
        totalQty: dto.type === 'TICKET' ? dto.totalQty ?? null : null,
        defaultCapacity: dto.type === 'RESERVATION' ? dto.slotCapacity ?? null : null,
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

  /** DROP 수량 조정 — 호텔이 "이 날 방 5개→2개"처럼 직접 줄이고 늘린다 (2026-09-10 픽스) */
  @Patch('my/drops/:id')
  async setDropQty(@UserId() userId: string, @Param('id') id: string, @Body() dto: SetQtyDto) {
    const m = await this.myMerchant(userId);
    const db = this.prisma.client;
    const d = await db.drop.findFirst({ where: { id, merchantId: m.id } });
    if (!d) throw new NotFoundException('내 딜이 아닙니다');
    const sold = d.totalQty - d.remainingQty;
    if (dto.totalQty < sold) {
      throw new BadRequestException(`이미 ${sold}개가 판매되어 그 이하로 줄일 수 없습니다`);
    }
    const remaining = dto.totalQty - sold;
    const updated = await db.drop.update({
      where: { id },
      data: {
        totalQty: dto.totalQty,
        remainingQty: remaining,
        // 수량이 다시 생기면 완판 해제, 0이 되면 완판
        ...(d.status === 'SOLD_OUT' && remaining > 0 ? { status: 'OPEN' } : {}),
        ...(d.status === 'OPEN' && remaining === 0 ? { status: 'SOLD_OUT' } : {}),
      },
    });
    return { ok: true, totalQty: updated.totalQty, remainingQty: updated.remainingQty, status: updated.status, message: '수량을 변경했습니다' };
  }

  /** 티켓 상품 수량 조정 */
  @Patch('my/products/:id')
  async setProductQty(@UserId() userId: string, @Param('id') id: string, @Body() dto: SetQtyDto) {
    const m = await this.myMerchant(userId);
    const db = this.prisma.client;
    const p = await db.product.findFirst({ where: { id, merchantId: m.id } });
    if (!p) throw new NotFoundException('내 상품이 아닙니다');
    if (p.type !== 'TICKET') throw new BadRequestException('티켓형 상품만 수량을 조정할 수 있습니다 (예약형은 회차 정원으로 관리)');
    if (dto.totalQty !== 0 && dto.totalQty < p.soldQty) {
      throw new BadRequestException(`이미 ${p.soldQty}개가 판매되어 그 이하로 줄일 수 없습니다`);
    }
    const totalQty = dto.totalQty === 0 ? null : dto.totalQty; // 0 = 무제한으로 전환
    const updated = await db.product.update({
      where: { id },
      data: {
        totalQty,
        // 수량이 다시 생기면 자동 품절 해제 (승인된 상품만)
        ...(p.approval === 'ACTIVE' && !p.isActive && (totalQty == null || totalQty > p.soldQty) ? { isActive: true } : {}),
        ...(totalQty != null && totalQty === p.soldQty ? { isActive: false } : {}),
      },
    });
    return { ok: true, totalQty: updated.totalQty, soldQty: updated.soldQty, isActive: updated.isActive, message: '수량을 변경했습니다' };
  }

  /**
   * 최근 판매 알림 — 앱에서 뭔가 팔리면 여기에 쌓인다 (이용권 구매·예약·딜 수령).
   * 점주 웹은 이걸 주기적으로 읽어 🔔 배지를 띄운다. (실 푸시는 스토어 앱 단계에서)
   */
  @Get('my/sales')
  async mySales(@UserId() userId: string, @Query('days') days?: string) {
    const m = await this.myMerchant(userId);
    const db = this.prisma.client;
    const since = new Date();
    since.setDate(since.getDate() - (Number(days) || 1));
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [vouchers, reservations, claims, todayCnt] = await Promise.all([
      db.voucher.findMany({
        where: { product: { merchantId: m.id }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' }, take: 50,
        include: { user: { select: { nickname: true } }, product: { select: { name: true } }, reservation: { select: { id: true } } },
      }),
      db.reservation.findMany({
        where: { product: { merchantId: m.id }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' }, take: 50,
        include: { user: { select: { nickname: true } }, product: { select: { name: true } }, slot: { select: { startAt: true } } },
      }),
      db.dropClaim.findMany({
        where: { drop: { merchantId: m.id }, claimedAt: { gte: since } },
        orderBy: { claimedAt: 'desc' }, take: 50,
        include: { user: { select: { nickname: true } }, drop: { select: { title: true, kind: true } } },
      }),
      db.dropClaim.count({ where: { drop: { merchantId: m.id }, claimedAt: { gte: todayStart } } })
        .then(async (c) => c + await db.voucher.count({ where: { product: { merchantId: m.id }, createdAt: { gte: todayStart }, reservation: null } })
          + await db.reservation.count({ where: { product: { merchantId: m.id }, createdAt: { gte: todayStart } } })),
    ]);

    const rows = [
      // 예약이 붙은 이용권은 예약 쪽으로만 집계 (중복 방지)
      ...vouchers.filter((v) => !v.reservation).map((v) => ({
        kind: 'TICKET' as const, at: v.createdAt, title: v.product.name, buyer: v.user.nickname, extra: `${v.headcount}명`,
      })),
      ...reservations.map((r) => ({
        kind: 'RESERVATION' as const, at: r.createdAt, title: r.product.name, buyer: r.user.nickname,
        extra: `${r.headcount}명 · ${new Date(r.slot.startAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      })),
      ...claims.map((c) => ({
        kind: c.drop.kind === 'TICKET' ? ('DROP_TICKET' as const) : ('DROP' as const),
        at: c.claimedAt, title: c.drop.title, buyer: c.user.nickname, extra: `${c.qty}개`,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 50);

    return { todayCount: todayCnt, rows };
  }

  /** 예약 목록 — 액티비티·숙박 점주가 사무실 PC에서 확인하는 핵심 화면 */
  @Get('my/reservations')
  async myReservations(@UserId() userId: string, @Query('days') days?: string) {
    const m = await this.myMerchant(userId);
    const since = new Date();
    since.setDate(since.getDate() - (Number(days) || 30));
    return this.prisma.client.reservation.findMany({
      where: { product: { merchantId: m.id }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { nickname: true } },
        product: { select: { id: true, name: true } },
        slot: { select: { startAt: true, endAt: true, capacity: true } },
      },
    });
  }

  /**
   * 달력 — 숙박 PMS처럼 '손님이 이용한 날' 기준으로 모아 준다.
   *
   * 예약형은 예약된 시각이 이용일이고, 티켓·딜·쿠폰은 현장에서 사용 처리한 시각이 이용일이다.
   * 티켓·딜은 오는 날이 정해져 있지 않아 쓰기 전에는 달력에 자리가 없다 — 아직 안 쓴 장수는
   * pending으로 따로 알려준다.
   *
   * 한 줄마다 결제 정보(언제·얼마·무엇으로)와 판매 경로를 같이 실어 보낸다. 점주가 이름을
   * 눌렀을 때 서버를 다시 부르지 않게 하려는 것이다.
   */
  @Get('my/calendar')
  async myCalendar(@UserId() userId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const m = await this.myMerchant(userId);
    const db = this.prisma.client;

    const base = from ? new Date(`${from}T00:00:00`) : new Date();
    const start = from ? base : new Date(base.getFullYear(), base.getMonth(), 1);
    const end = to
      ? new Date(`${to}T23:59:59.999`)
      : new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);

    const orderSel = {
      select: {
        orderNo: true,
        paidAt: true,
        totalAmount: true,
        status: true,
        items: { select: { type: true, productId: true, refId: true, name: true, unitPrice: true, qty: true, amount: true } },
        payments: { select: { method: true, provider: true, amount: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
      },
    };
    const productSel = { select: { id: true, name: true, basePrice: true, campaign: { select: { title: true } } } };

    const [reservations, redemptions, pendingTickets, pendingClaims] = await Promise.all([
      db.reservation.findMany({
        where: { product: { merchantId: m.id }, slot: { startAt: { gte: start, lte: end } } },
        include: {
          user: { select: { nickname: true } },
          product: productSel,
          slot: { select: { startAt: true, endAt: true } },
          voucher: { select: { usedAt: true, order: orderSel } },
        },
      }),
      db.redemption.findMany({
        where: { merchantId: m.id, createdAt: { gte: start, lte: end } },
        include: {
          user: { select: { nickname: true } },
          voucher: { select: { reservation: { select: { id: true } }, product: productSel, order: orderSel } },
          dropClaim: {
            select: {
              dropId: true,
              qty: true,
              drop: { select: { title: true, kind: true, campaign: { select: { title: true } } } },
              order: orderSel,
            },
          },
          userBenefit: { select: { benefit: { select: { title: true } } } },
        },
      }),
      db.voucher.count({ where: { product: { merchantId: m.id }, status: 'ISSUED', validTo: { gte: new Date() } } }),
      db.dropClaim.count({ where: { drop: { merchantId: m.id }, status: 'CLAIMED', validTo: { gte: new Date() } } }),
    ]);

    /** 이 가게 몫만 골라낸다. 주문 한 건에 여러 가게 상품이 섞일 수 있다. */
    const money = (order: any, productId?: string | null, refId?: string | null) => {
      if (!order) return null;
      const it = (order.items ?? []).find(
        (i: any) => (productId && i.productId === productId) || (refId && i.refId === refId),
      );
      return it ? it.amount : order.totalAmount;
    };
    const payLabel = (order: any) =>
      !order ? '무료 수령' : order.status === 'CANCELLED' || order.status === 'REFUNDED' ? '결제 취소' : order.paidAt ? '결제 완료' : '결제 대기';
    // 결제 수단 — PG를 붙이기 전까지는 내부 표시값('mock')이 들어 있다. 그대로 보여주지 않는다.
    const methodOf = (order: any) => {
      const m: string | null = order?.payments?.[0]?.method ?? null;
      return m && m.toLowerCase() !== 'mock' ? m : null;
    };
    const source = (campaignTitle: string | null | undefined, kind: string, memberPriced: boolean) => {
      const parts: string[] = [];
      if (campaignTitle) parts.push(`기획전 · ${campaignTitle}`);
      else if (kind === 'DROP') parts.push('DROP 딜');
      else if (kind === 'BENEFIT') parts.push('할인 쿠폰');
      else parts.push('앱에서 바로 구매');
      if (memberPriced) parts.push('멤버십 회원가');
      return parts.join(' · ');
    };
    const RESV: Record<string, string> = { REQUESTED: '예약 요청', CONFIRMED: '예약 확정', CANCELLED: '예약 취소', NO_SHOW: '노쇼', COMPLETED: '이용 완료' };

    const entries: any[] = [
      ...reservations.map((r: any) => {
        const order = r.voucher?.order ?? null;
        const item = (order?.items ?? []).find((i: any) => i.productId === r.product.id);
        return {
          id: 'R' + r.id,
          kind: 'RESERVATION',
          at: r.slot.startAt,
          endAt: r.slot.endAt,
          title: r.product.name,
          customer: r.contactName || r.user.nickname,
          phone: r.contactPhone || null,
          headcount: r.headcount,
          status: RESV[r.status] ?? r.status,
          cancelled: r.status === 'CANCELLED',
          used: !!r.voucher?.usedAt,
          payLabel: payLabel(order),
          amount: money(order, r.product.id),
          paidAt: order?.paidAt ?? r.createdAt,
          method: methodOf(order),
          orderNo: order?.orderNo ?? null,
          savedAmount: null,
          source: source(r.product.campaign?.title, 'PRODUCT', !!item && item.unitPrice < r.product.basePrice),
          memo: r.memo ?? null,
        };
      }),
      // 예약이 붙은 이용권은 예약 줄로 이미 보이므로 건너뛴다 (한 건이 두 줄로 보이면 안 된다)
      ...redemptions
        .filter((x: any) => !(x.type === 'VOUCHER' && x.voucher?.reservation))
        .map((x: any) => {
          const v = x.voucher;
          const c = x.dropClaim;
          const order = v?.order ?? c?.order ?? null;
          const prod = v?.product ?? null;
          const item = (order?.items ?? []).find((i: any) => prod && i.productId === prod.id);
          const kind = x.type === 'VOUCHER' ? 'TICKET' : x.type === 'DROP' ? 'DROP' : 'BENEFIT';
          return {
            id: 'U' + x.id,
            kind,
            at: x.createdAt,
            endAt: null,
            title: prod?.name ?? c?.drop.title ?? x.userBenefit?.benefit.title ?? '-',
            customer: x.user.nickname,
            phone: null,
            headcount: x.headcount,
            status: x.status === 'DONE' ? '사용 완료' : '사용 취소',
            cancelled: x.status !== 'DONE',
            used: true,
            payLabel: kind === 'BENEFIT' ? '할인 쿠폰(무료)' : payLabel(order),
            amount: money(order, prod?.id ?? null, c?.dropId ?? null),
            paidAt: order?.paidAt ?? null,
            method: methodOf(order),
            orderNo: order?.orderNo ?? null,
            savedAmount: x.savedAmount || null,
            source: source(prod?.campaign?.title ?? c?.drop.campaign?.title, kind === 'TICKET' ? 'PRODUCT' : kind, !!item && !!prod && item.unitPrice < prod.basePrice),
            memo: null,
          };
        }),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return { from: start, to: end, entries, pending: { tickets: pendingTickets, drops: pendingClaims } };
  }

  /** 판매·사용내역 엑셀 — 사무실 정리용 */
  @Get('my/report')
  async myReport(@UserId() userId: string, @Query('days') days?: string, @Res() res?: any) {
    const m = await this.myMerchant(userId);
    const since = new Date();
    since.setDate(since.getDate() - (Number(days) || 30));
    since.setHours(0, 0, 0, 0);
    const rows = await this.prisma.client.redemption.findMany({
      where: { merchantId: m.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { nickname: true } },
        userBenefit: { include: { benefit: { select: { title: true } } } },
        dropClaim: { include: { drop: { select: { title: true } } } },
        voucher: { include: { product: { select: { name: true } } } },
      },
    });
    const TYPE_LABEL: Record<string, string> = { BENEFIT: '혜택', DROP: 'DROP', VOUCHER: '이용권' };
    const data = rows.map((r) => ({
      '사용시간': fmtDateTime(r.createdAt),
      '항목': r.voucher?.product.name ?? r.dropClaim?.drop.title ?? r.userBenefit?.benefit.title ?? '-',
      '유형': TYPE_LABEL[r.type] ?? r.type,
      '고객': r.user.nickname,
      '인원': r.headcount,
      '절약액 (KRW)': r.savedAmount,
      '상태': r.status === 'DONE' ? '완료' : '취소',
    }));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ '사용시간': '', '안내': '내역이 없습니다' }]);
    ws['!cols'] = [{ wch: 19 }, { wch: 32 }, { wch: 8 }, { wch: 10 }, { wch: 6 }, { wch: 11 }, { wch: 7 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '사용내역');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = encodeURIComponent(`${m.name}_사용내역_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fname}`,
    });
    res.send(buf);
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
