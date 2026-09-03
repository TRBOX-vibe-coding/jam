/** 내 혜택함 — 가맹점별로 묶어서 돌려준다. */
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';

@Controller('me/benefits')
export class BenefitsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(UserGuard)
  async list(@UserId() userId: string) {
    const now = new Date();
    const rows = await this.prisma.client.userBenefit.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ validTo: null }, { validTo: { gt: now } }],
        benefit: { isActive: true, merchant: { status: 'ACTIVE' } },
      },
      include: {
        benefit: {
          include: {
            merchant: {
              select: {
                id: true, name: true, address: true, thumbnailUrl: true, i18n: true,
                region: { select: { name: true, i18n: true } },
                category: { select: { name: true, emoji: true, i18n: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 가맹점 단위로 그룹
    const byMerchant = new Map<string, {
      merchant: (typeof rows)[number]['benefit']['merchant'];
      items: { id: string; title: string; type: string; value: number; freebieName: string | null; validTo: Date | null; sourceType: string }[];
    }>();
    for (const ub of rows) {
      const m = ub.benefit.merchant;
      if (!byMerchant.has(m.id)) byMerchant.set(m.id, { merchant: m, items: [] });
      byMerchant.get(m.id)!.items.push({
        id: ub.id,
        title: ub.benefit.title,
        type: ub.benefit.type,
        value: ub.benefit.value,
        freebieName: ub.benefit.freebieName,
        validTo: ub.validTo,
        sourceType: ub.sourceType,
        i18n: (ub.benefit as any).i18n,
      } as any);
    }

    return {
      totalCount: rows.length,
      merchants: [...byMerchant.values()],
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [BenefitsController],
  providers: [PrismaService],
})
export class BenefitsModule {}
