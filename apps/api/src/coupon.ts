/**
 * 타임 쿠폰 드롭 — 정해진 시각마다 무료 유저에게 선착순 쿠폰을 뿌린다.
 * 멤버십 회원은 대상이 아니다(이미 전 혜택 상시 오픈) — 전환 유도용 기능.
 */
import {
  BadRequestException, Controller, Get, Module, NotFoundException,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule, UserGuard, UserId } from './auth';
import { langOf, trField } from './i18n.util';

/** "HH:mm" → 오늘 그 시각의 Date */
function todayAt(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function slotKeyOf(opensAt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${opensAt.getFullYear()}-${p(opensAt.getMonth() + 1)}-${p(opensAt.getDate())} ${p(opensAt.getHours())}:${p(opensAt.getMinutes())}`;
}

@Controller('coupon-drops')
export class CouponController {
  constructor(private prisma: PrismaService) {}

  /** 오늘의 배포 일정 — 비로그인도 볼 수 있다(홈 노출용) */
  @Get('today')
  async today(@Req() req: any) {
    const lang = langOf(req);
    const db = this.prisma.client;
    const now = new Date();
    const drops = await db.couponDrop.findMany({
      where: { isActive: true, benefit: { isActive: true, merchant: { status: 'ACTIVE' } } },
      include: {
        benefit: {
          select: {
            id: true, title: true, type: true, value: true, freebieName: true, i18n: true,
            merchant: { select: { name: true, i18n: true, region: { select: { name: true, i18n: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result = [];
    for (const d of drops) {
      const slots = [];
      for (const t of [...d.times].sort()) {
        const opensAt = todayAt(t);
        const closesAt = new Date(opensAt.getTime() + d.claimWindowMinutes * 60_000);
        const key = slotKeyOf(opensAt);
        const claimed = await db.couponClaim.count({ where: { couponDropId: d.id, slotKey: key } });
        const remaining = Math.max(0, d.qtyPerSlot - claimed);
        let state: 'upcoming' | 'open' | 'soldout' | 'ended';
        if (now < opensAt) state = 'upcoming';
        else if (now >= closesAt) state = 'ended';
        else state = remaining > 0 ? 'open' : 'soldout';
        slots.push({ time: t, opensAt, closesAt, state, remaining, total: d.qtyPerSlot });
      }
      result.push({
        id: d.id,
        validHours: d.validHours,
        benefit: {
          title: trField(d.benefit, 'title', lang),
          type: d.benefit.type,
          value: d.benefit.value,
          freebieName: trField(d.benefit, 'freebieName', lang),
          merchantName: trField(d.benefit.merchant, 'name', lang),
          regionName: trField(d.benefit.merchant.region, 'name', lang),
        },
        slots,
      });
    }
    return { now, drops: result };
  }

  /** 선착순 받기 — 지금 열려 있는 회차에서 1인 1회 */
  @Post(':id/claim')
  @UseGuards(UserGuard)
  async claim(@UserId() userId: string, @Param('id') id: string) {
    const db = this.prisma.client;
    const now = new Date();

    const drop = await db.couponDrop.findFirst({
      where: { id, isActive: true, benefit: { isActive: true, merchant: { status: 'ACTIVE' } } },
      include: { benefit: { select: { id: true, title: true } } },
    });
    if (!drop) throw new NotFoundException('진행 중인 쿠폰 배포가 아닙니다');

    // 멤버십 회원은 대상 아님 — 이미 전 혜택이 상시로 열려 있다
    const activeMembership = await db.userMembership.findFirst({
      where: { userId, endAt: { gt: now } },
    });
    if (activeMembership) {
      throw new BadRequestException('멤버십 회원은 모든 혜택이 이미 상시 오픈되어 있어요 🎉');
    }

    // 지금 열려 있는 회차 찾기
    let openSlot: { key: string } | null = null;
    for (const t of drop.times) {
      const opensAt = todayAt(t);
      const closesAt = new Date(opensAt.getTime() + drop.claimWindowMinutes * 60_000);
      if (now >= opensAt && now < closesAt) {
        openSlot = { key: slotKeyOf(opensAt) };
        break;
      }
    }
    if (!openSlot) throw new BadRequestException('지금은 받을 수 있는 시간이 아니에요. 배포 시간에 다시 와주세요!');

    return db.$transaction(async (tx) => {
      const claimed = await tx.couponClaim.count({
        where: { couponDropId: drop.id, slotKey: openSlot!.key },
      });
      if (claimed >= drop.qtyPerSlot) {
        throw new BadRequestException('이번 회차 수량이 모두 소진됐어요. 다음 시간을 노려보세요!');
      }
      const dup = await tx.couponClaim.findFirst({
        where: { couponDropId: drop.id, userId, slotKey: openSlot!.key },
      });
      if (dup) throw new BadRequestException('이번 회차 쿠폰은 이미 받으셨어요');

      await tx.couponClaim.create({
        data: { couponDropId: drop.id, userId, slotKey: openSlot!.key },
      });
      const validTo = new Date(now.getTime() + drop.validHours * 3600_000);
      await tx.userBenefit.upsert({
        where: {
          userId_benefitId_sourceType_sourceId: {
            userId, benefitId: drop.benefit.id, sourceType: 'MANUAL',
            sourceId: `coupon:${drop.id}:${openSlot!.key}`,
          },
        },
        update: {},
        create: {
          userId, benefitId: drop.benefit.id, sourceType: 'MANUAL',
          sourceId: `coupon:${drop.id}:${openSlot!.key}`,
          validFrom: now, validTo,
        },
      });
      const remaining = drop.qtyPerSlot - claimed - 1;
      return {
        ok: true,
        benefitTitle: drop.benefit.title,
        validTo,
        remaining,
        message: `쿠폰을 받았어요! ${drop.validHours}시간 안에 매장에서 사용하세요.`,
      };
    });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [CouponController],
  providers: [PrismaService],
})
export class CouponModule {}
