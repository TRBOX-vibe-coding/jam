/**
 * 담기(찜) — 쿠폰·상품을 저장해 MY의 "담은 목록"에서 본다.
 * 토글 방식(있으면 해제, 없으면 담기). 추후 여행 계획 기능의 기초 데이터가 된다.
 */
import { BadRequestException, Body, Controller, Get, Module, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { langOf, trField } from './i18n.util';
import { benefitSaving, productSaving } from './savings.util';

class ToggleSaveDto {
  @IsIn(['BENEFIT', 'PRODUCT']) itemType!: 'BENEFIT' | 'PRODUCT';
  @IsString() refId!: string;
}

@Controller('me/saves')
@UseGuards(UserGuard)
export class SavesController {
  constructor(private prisma: PrismaService) {}

  /** 담기 토글 — 이미 담았으면 해제 */
  @Post()
  async toggle(@UserId() userId: string, @Body() dto: ToggleSaveDto) {
    const db = this.prisma.client;
    // 존재하는 대상인지 확인 (지워진 쿠폰·상품을 담는 것 방지)
    if (dto.itemType === 'BENEFIT') {
      const b = await db.benefit.findUnique({ where: { id: dto.refId }, select: { id: true } });
      if (!b) throw new BadRequestException('없는 쿠폰입니다');
    } else {
      const p = await db.product.findUnique({ where: { id: dto.refId }, select: { id: true } });
      if (!p) throw new BadRequestException('없는 상품입니다');
    }
    const existing = await db.savedItem.findUnique({
      where: { userId_itemType_refId: { userId, itemType: dto.itemType, refId: dto.refId } },
    });
    if (existing) {
      await db.savedItem.delete({ where: { id: existing.id } });
      return { saved: false };
    }
    await db.savedItem.create({ data: { userId, itemType: dto.itemType, refId: dto.refId } });
    return { saved: true };
  }

  /** 하트 표시용 — "TYPE:refId" 문자열 배열 */
  @Get('ids')
  async ids(@UserId() userId: string) {
    const rows = await this.prisma.client.savedItem.findMany({
      where: { userId },
      select: { itemType: true, refId: true },
    });
    return rows.map((r) => `${r.itemType}:${r.refId}`);
  }

  /** 담은 목록 — 쿠폰·상품 상세를 붙여서 돌려준다 */
  @Get()
  async list(@UserId() userId: string, @Req() req: any) {
    const lang = langOf(req);
    const db = this.prisma.client;
    const rows = await this.prisma.client.savedItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const benefitIds = rows.filter((r) => r.itemType === 'BENEFIT').map((r) => r.refId);
    const productIds = rows.filter((r) => r.itemType === 'PRODUCT').map((r) => r.refId);

    const [benefitRows, productRows, myUbs, trip] = await Promise.all([
      db.benefit.findMany({
        where: { id: { in: benefitIds } },
        include: {
          merchant: {
            select: {
              id: true, name: true, thumbnailUrl: true, avgSpendPerPerson: true, i18n: true,
              region: { select: { name: true, i18n: true } },
              category: { select: { name: true, emoji: true, i18n: true } },
            },
          },
        },
      }),
      db.product.findMany({
        where: { id: { in: productIds } },
        include: {
          merchant: {
            select: { id: true, name: true, i18n: true, region: { select: { name: true, i18n: true } } },
          },
        },
      }),
      db.userBenefit.findMany({
        where: { userId, benefitId: { in: benefitIds }, status: 'ACTIVE' },
        select: { id: true, benefitId: true },
      }),
      db.trip.findUnique({ where: { userId }, select: { headcount: true } }),
    ]);
    const headcount = trip?.headcount ?? 1;
    const ubByBenefit = new Map(myUbs.map((u) => [u.benefitId, u.id]));
    const bMap = new Map(benefitRows.map((b) => [b.id, b]));
    const pMap = new Map(productRows.map((p) => [p.id, p]));

    return {
      benefits: rows
        .filter((r) => r.itemType === 'BENEFIT' && bMap.has(r.refId))
        .map((r) => {
          const b = bMap.get(r.refId)!;
          return {
            refId: b.id,
            userBenefitId: ubByBenefit.get(b.id) ?? null,
            title: trField(b, 'title', lang),
            type: b.type,
            value: b.value,
            isActive: b.isActive,
            estimatedSaving: benefitSaving(b, headcount, b.merchant.avgSpendPerPerson),
            merchant: {
              id: b.merchant.id,
              name: trField(b.merchant, 'name', lang),
              thumbnailUrl: b.merchant.thumbnailUrl,
              region: trField(b.merchant.region, 'name', lang),
              categoryEmoji: b.merchant.category.emoji,
            },
            savedAt: r.createdAt,
          };
        }),
      products: rows
        .filter((r) => r.itemType === 'PRODUCT' && pMap.has(r.refId))
        .map((r) => {
          const p = pMap.get(r.refId)!;
          return {
            refId: p.id,
            name: trField(p, 'name', lang),
            imageUrl: p.imageUrl,
            basePrice: p.basePrice,
            memberPrice: p.memberPrice,
            type: p.type,
            isActive: p.isActive,
            estimatedSaving: productSaving(p, headcount),
            merchant: { id: p.merchant.id, name: trField(p.merchant, 'name', lang), region: trField(p.merchant.region, 'name', lang) },
            savedAt: r.createdAt,
          };
        }),
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [SavesController],
  providers: [PrismaService],
})
export class SavesModule {}
