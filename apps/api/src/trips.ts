/**
 * 여행 일정 — 유저당 1개(MVP). 2026-09-09 대표 픽스.
 * 기간이 잼을 추천하고, 담은 항목을 Day에 배치하면 예상 절약액을 계산한다.
 * 무료 유저도 전부 사용 가능 — 이 기능 자체가 "맛보기잼"이다.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, Module, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { langOf, trField } from './i18n.util';
import { benefitSaving, productSaving } from './savings.util';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class UpsertTripDto {
  @IsString() @Matches(DATE_RE) startDate!: string; // YYYY-MM-DD (KST 기준 날짜)
  @IsString() @Matches(DATE_RE) endDate!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) headcount!: number;
}

class PlaceItemDto {
  @IsIn(['BENEFIT', 'PRODUCT']) itemType!: 'BENEFIT' | 'PRODUCT';
  @IsString() refId!: string;
  /** null이면 일정에서 제거 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(30) dayIndex?: number;
}

/** 여행 일수 → 추천 잼 코드. 3일잼=3박4일 커버, 5일잼=5박6일 (N+1일 규칙) */
function recommendPlan(days: number) {
  if (days <= 4) return 'JAM3';
  if (days <= 6) return 'JAM5';
  return 'JAMMASTER';
}

function dayCount(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

@Controller('me/trip')
@UseGuards(UserGuard)
export class TripsController {
  constructor(private prisma: PrismaService) {}

  /** 여행 만들기/수정 — 날짜와 인원만 (기간은 잼 추천의 근거) */
  @Post()
  async upsert(@UserId() userId: string, @Body() dto: UpsertTripDto) {
    const start = new Date(`${dto.startDate}T00:00:00`);
    const end = new Date(`${dto.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('날짜가 올바르지 않습니다');
    }
    if (end < start) throw new BadRequestException('종료일이 시작일보다 빠릅니다');
    const days = dayCount(start, end);
    if (days > 31) throw new BadRequestException('여행은 최대 31일까지 담을 수 있어요');

    const trip = await this.prisma.client.trip.upsert({
      where: { userId },
      update: { startDate: start, endDate: end, headcount: dto.headcount },
      create: { userId, startDate: start, endDate: end, headcount: dto.headcount },
    });
    // 기간이 줄었으면 범위 밖 Day 항목은 마지막 날로 당긴다
    await this.prisma.client.tripItem.updateMany({
      where: { tripId: trip.id, dayIndex: { gte: days } },
      data: { dayIndex: days - 1 },
    });
    return { ok: true, tripId: trip.id, days, recommendedPlan: recommendPlan(days) };
  }

  /** 담은 항목을 Day에 놓기/옮기기/빼기 */
  @Post('items')
  async place(@UserId() userId: string, @Body() dto: PlaceItemDto) {
    const trip = await this.prisma.client.trip.findUnique({ where: { userId } });
    if (!trip) throw new BadRequestException('먼저 여행을 만들어 주세요');
    const days = dayCount(trip.startDate, trip.endDate);

    if (dto.dayIndex == null) {
      await this.prisma.client.tripItem.deleteMany({
        where: { tripId: trip.id, itemType: dto.itemType, refId: dto.refId },
      });
      return { ok: true, placed: false };
    }
    if (dto.dayIndex >= days) throw new BadRequestException('여행 기간을 벗어난 날짜입니다');
    await this.prisma.client.tripItem.upsert({
      where: { tripId_itemType_refId: { tripId: trip.id, itemType: dto.itemType, refId: dto.refId } },
      update: { dayIndex: dto.dayIndex },
      create: { tripId: trip.id, itemType: dto.itemType, refId: dto.refId, dayIndex: dto.dayIndex },
    });
    return { ok: true, placed: true, dayIndex: dto.dayIndex };
  }

  @Delete()
  async remove(@UserId() userId: string) {
    await this.prisma.client.trip.deleteMany({ where: { userId } });
    return { ok: true };
  }

  /** 내 여행 — Day별 항목 + 예상 절약 합계 + 잼 가격 대비 이득 */
  @Get()
  async detail(@UserId() userId: string, @Req() req: any) {
    const lang = langOf(req);
    const db = this.prisma.client;
    const trip = await db.trip.findUnique({ where: { userId }, include: { items: true } });
    if (!trip) return { trip: null };

    const days = dayCount(trip.startDate, trip.endDate);
    const benefitIds = trip.items.filter((i) => i.itemType === 'BENEFIT').map((i) => i.refId);
    const productIds = trip.items.filter((i) => i.itemType === 'PRODUCT').map((i) => i.refId);

    const [benefits, products, plans] = await Promise.all([
      db.benefit.findMany({
        where: { id: { in: benefitIds } },
        include: { merchant: { select: { id: true, name: true, thumbnailUrl: true, avgSpendPerPerson: true, i18n: true, region: { select: { name: true, i18n: true } }, category: { select: { emoji: true } } } } },
      }),
      db.product.findMany({
        where: { id: { in: productIds } },
        include: { merchant: { select: { id: true, name: true, thumbnailUrl: true, i18n: true, region: { select: { name: true, i18n: true } }, category: { select: { emoji: true } } } } },
      }),
      db.membershipPlan.findMany({ where: { code: { in: ['JAM3', 'JAM5', 'JAMMASTER'] } }, select: { code: true, name: true, price: true, i18n: true } }),
    ]);
    const bMap = new Map(benefits.map((b) => [b.id, b]));
    const pMap = new Map(products.map((p) => [p.id, p]));

    let totalSaving = 0;
    let hasPlusAlpha = false;
    const items = trip.items
      .map((it) => {
        if (it.itemType === 'BENEFIT') {
          const b = bMap.get(it.refId);
          if (!b) return null;
          const saving = benefitSaving(b, trip.headcount, b.merchant.avgSpendPerPerson);
          if (saving == null) hasPlusAlpha = true; else totalSaving += saving;
          return {
            itemType: 'BENEFIT' as const, refId: b.id, dayIndex: it.dayIndex,
            title: trField(b, 'title', lang), benefitType: b.type, value: b.value,
            saving,
            merchant: { id: b.merchant.id, name: trField(b.merchant, 'name', lang), thumbnailUrl: b.merchant.thumbnailUrl, region: trField(b.merchant.region, 'name', lang), emoji: b.merchant.category.emoji },
          };
        }
        const p = pMap.get(it.refId);
        if (!p) return null;
        const saving = productSaving(p, trip.headcount);
        totalSaving += saving;
        return {
          itemType: 'PRODUCT' as const, refId: p.id, dayIndex: it.dayIndex,
          title: trField(p, 'name', lang), imageUrl: p.imageUrl,
          basePrice: p.basePrice, memberPrice: p.memberPrice,
          saving,
          merchant: { id: p.merchant.id, name: trField(p.merchant, 'name', lang), thumbnailUrl: p.merchant.thumbnailUrl, region: trField(p.merchant.region, 'name', lang), emoji: p.merchant.category.emoji },
        };
      })
      .filter(Boolean);

    const recommended = recommendPlan(days);
    const plan = plans.find((pl) => pl.code === recommended) ?? null;
    const multiple = plan && plan.price > 0 ? Math.round((totalSaving / plan.price) * 10) / 10 : null;
    const grade = multiple == null ? null : multiple >= 2 ? 'GREAT' : multiple >= 1 ? 'GOOD' : 'START';

    return {
      trip: {
        startDate: trip.startDate, endDate: trip.endDate, headcount: trip.headcount, days,
        totalSaving, hasPlusAlpha,
        recommendedPlan: plan ? { code: plan.code, name: trField(plan, 'name', lang), price: plan.price } : null,
        multiple, grade,
        items,
      },
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [TripsController],
  providers: [PrismaService],
})
export class TripsModule {}
