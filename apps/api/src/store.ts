/**
 * 제휴 매장 탐색 — 기존 홀릭잼의 본체(쿠폰북).
 * 비로그인도 모든 제휴처와 혜택을 둘러볼 수 있어야 멤버십을 살 이유가 보인다.
 */
import { Controller, Get, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth';

@Controller('merchants')
export class StoreController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query('regionId') regionId?: string, @Query('categoryId') categoryId?: string) {
    const now = new Date();
    const rows = await this.prisma.client.merchant.findMany({
      where: {
        status: 'ACTIVE',
        ...(regionId ? { regionId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ region: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: {
        region: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, emoji: true } },
        benefits: {
          where: { isActive: true },
          select: {
            id: true, title: true, type: true, value: true,
            freebieName: true, companionLimit: true, conditions: true,
          },
        },
        products: { where: { isActive: true }, select: { id: true } },
        drops: { where: { status: 'OPEN', closeAt: { gt: now } }, select: { id: true } },
      },
    });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      intro: m.intro,
      address: m.address,
      thumbnailUrl: m.thumbnailUrl,
      region: m.region,
      category: m.category,
      benefits: m.benefits,
      productCount: m.products.length,
      openDropCount: m.drops.length,
    }));
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const now = new Date();
    const m = await this.prisma.client.merchant.findFirst({
      where: { id, status: 'ACTIVE' },
      include: {
        region: { select: { name: true } },
        category: { select: { name: true, emoji: true } },
        benefits: {
          where: { isActive: true },
          select: {
            id: true, title: true, type: true, value: true,
            freebieName: true, companionLimit: true, maxUsePerDay: true, conditions: true,
          },
        },
        products: {
          where: { isActive: true },
          select: {
            id: true, name: true, type: true, imageUrl: true,
            basePrice: true, memberPrice: true,
          },
        },
        drops: {
          where: { status: 'OPEN', closeAt: { gt: now } },
          select: {
            id: true, title: true, imageUrl: true, kind: true,
            normalPrice: true, dropPrice: true, remainingQty: true, closeAt: true,
          },
        },
      },
    });
    if (!m) throw new NotFoundException('매장을 찾을 수 없습니다');
    return m;
  }
}

@Module({
  imports: [AuthModule],
  controllers: [StoreController],
  providers: [PrismaService],
})
export class StoreModule {}
