/**
 * 광고 자리 관리 — 슈퍼 관리자 전용 (2026-09-10 픽스).
 * 카테고리별로 쿠폰/상품에 1~10순위를 기간과 함께 지정한다.
 * 기간 안에만 목록 상단에 고정되고, 지나면 자동으로 내려간다. (수금은 월 정액 오프라인)
 */
import {
  BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException,
  Param, Post, UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsISO8601, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AdminGuard, AdminId, AuthModule } from './auth';

class UpsertAdDto {
  @IsString() categoryId!: string;
  @IsIn(['BENEFIT', 'PRODUCT']) itemType!: 'BENEFIT' | 'PRODUCT';
  @IsString() refId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rank!: number;
  @IsISO8601() startAt!: string;
  @IsISO8601() endAt!: string;
}

@Controller('admin/ads')
@UseGuards(AdminGuard)
export class AdsController {
  constructor(private prisma: PrismaService) {}

  /** 카테고리별 광고 자리 현황 + 지정 가능한 쿠폰/상품 목록 */
  @Get(':categoryId')
  async byCategory(@Param('categoryId') categoryId: string) {
    const db = this.prisma.client;
    const [slots, benefits, products] = await Promise.all([
      db.adSlot.findMany({ where: { categoryId }, orderBy: [{ itemType: 'asc' }, { rank: 'asc' }] }),
      db.benefit.findMany({
        where: { isActive: true, merchant: { categoryId, status: 'ACTIVE' } },
        select: { id: true, title: true, merchant: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }, take: 200,
      }),
      db.product.findMany({
        where: { isActive: true, categoryId },
        select: { id: true, name: true, merchant: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }, take: 200,
      }),
    ]);
    const now = new Date();
    // 자리별 항목 이름을 붙인다
    const bMap = new Map(benefits.map((b) => [b.id, `${b.merchant.name} · ${b.title}`]));
    const pMap = new Map(products.map((p) => [p.id, `${p.merchant.name} · ${p.name}`]));
    return {
      slots: slots.map((s) => ({
        ...s,
        label: (s.itemType === 'BENEFIT' ? bMap.get(s.refId) : pMap.get(s.refId)) ?? '(삭제된 항목)',
        live: s.startAt <= now && s.endAt >= now,
      })),
      benefits: benefits.map((b) => ({ id: b.id, label: `${b.merchant.name} · ${b.title}` })),
      products: products.map((p) => ({ id: p.id, label: `${p.merchant.name} · ${p.name}` })),
    };
  }

  /** 순위 지정/변경 — 같은 (카테고리, 종류, 순위) 자리는 덮어쓴다 */
  @Post()
  async upsert(@AdminId() adminId: string, @Body() dto: UpsertAdDto) {
    const db = this.prisma.client;
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException('종료가 시작보다 빨라요');
    const exists = dto.itemType === 'BENEFIT'
      ? await db.benefit.findUnique({ where: { id: dto.refId }, select: { id: true } })
      : await db.product.findUnique({ where: { id: dto.refId }, select: { id: true } });
    if (!exists) throw new NotFoundException('대상 항목이 없습니다');

    const slot = await db.adSlot.upsert({
      where: { categoryId_itemType_rank: { categoryId: dto.categoryId, itemType: dto.itemType, rank: dto.rank } },
      update: { refId: dto.refId, startAt, endAt },
      create: { categoryId: dto.categoryId, itemType: dto.itemType, refId: dto.refId, rank: dto.rank, startAt, endAt },
    });
    await db.auditLog.create({
      data: { adminUserId: adminId, action: 'AD_SET', targetType: 'AdSlot', targetId: slot.id, memo: `${dto.itemType} ${dto.rank}순위 ${dto.startAt}~${dto.endAt}` },
    });
    return { ok: true, slot, message: `${dto.rank}순위 광고를 저장했습니다` };
  }

  @Delete(':id')
  async remove(@AdminId() adminId: string, @Param('id') id: string) {
    await this.prisma.client.adSlot.delete({ where: { id } });
    await this.prisma.client.auditLog.create({
      data: { adminUserId: adminId, action: 'AD_DELETE', targetType: 'AdSlot', targetId: id },
    });
    return { ok: true, message: '광고 자리를 비웠습니다' };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdsController],
  providers: [PrismaService],
})
export class AdsModule {}
