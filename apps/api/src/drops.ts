/**
 * 오늘의 DROP.
 *  - 목록은 비로그인도 볼 수 있다(멤버 전용은 잠금 표시).
 *  - 획득(claim)은 트랜잭션에서 남은 수량을 조건부 차감한다 — 동시 요청에도 초과 판매가 없다.
 *  - kind=TICKET이면 획득과 동시에 주문·모의결제·이용권 발급까지 처리한다.
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module,
  NotFoundException, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AuthModule, OptionalUserGuard, UserGuard, UserId } from './auth';
import { addDays, makeOrderNo, makeVoucherCode } from './util';

class ClaimDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) qty?: number;
}

async function hasActiveMembership(db: PrismaService['client'], userId: string) {
  const m = await db.userMembership.findFirst({
    where: { userId, status: 'ACTIVE', endAt: { gt: new Date() } },
    select: { id: true },
  });
  return !!m;
}

@Controller('drops')
export class DropsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(OptionalUserGuard)
  async list(
    @UserId() userId: string | undefined,
    @Query('regionId') regionId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const db = this.prisma.client;
    const now = new Date();
    const isMember = userId ? await hasActiveMembership(db, userId) : false;

    const drops = await db.drop.findMany({
      where: {
        status: 'OPEN',
        closeAt: { gt: now },
        // 선오픈: 일반 공개 전이라도 멤버에게는 보인다
        OR: [
          { openAt: { lte: now } },
          ...(isMember ? [{ memberPreOpenAt: { lte: now } }] : []),
        ],
        ...(regionId ? { regionId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ isSponsored: 'desc' }, { closeAt: 'asc' }],
      include: {
        merchant: { select: { id: true, name: true, address: true, i18n: true } },
        region: { select: { id: true, name: true, i18n: true } },
        category: { select: { id: true, name: true, emoji: true, i18n: true } },
      },
    });

    return drops.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      description: d.description,
      i18n: (d as any).i18n,
      imageUrl: d.imageUrl,
      merchant: d.merchant,
      region: d.region,
      category: d.category,
      normalPrice: d.normalPrice,
      dropPrice: d.dropPrice,
      discountRate: Math.round((1 - d.dropPrice / d.normalPrice) * 100),
      remainingQty: d.remainingQty,
      totalQty: d.totalQty,
      personsPerUnit: d.personsPerUnit,
      closeAt: d.closeAt,
      openAt: d.openAt,
      usableFromMinute: d.usableFromMinute,
      usableToMinute: d.usableToMinute,
      isSponsored: d.isSponsored,
      memberOnly: d.audience === 'MEMBER_ONLY',
      /** 멤버 전용인데 비멤버가 보면 잠금 */
      locked: d.audience === 'MEMBER_ONLY' && !isMember,
      /** 선오픈 구간 표시 */
      preOpen: d.openAt > now,
    }));
  }

  @Get(':id')
  @UseGuards(OptionalUserGuard)
  async detail(@UserId() userId: string | undefined, @Param('id') id: string) {
    const db = this.prisma.client;
    const d = await db.drop.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, name: true, address: true, intro: true, i18n: true } },
        region: { select: { name: true, i18n: true } },
        category: { select: { name: true, emoji: true, i18n: true } },
        product: { select: { id: true, name: true, type: true, i18n: true } },
      },
    });
    if (!d) throw new NotFoundException('DROP을 찾을 수 없습니다');

    const myClaims = userId
      ? await db.dropClaim.count({ where: { dropId: id, userId, status: { in: ['CLAIMED', 'USED'] } } })
      : 0;
    const isMember = userId ? await hasActiveMembership(db, userId) : false;

    return { ...d, myClaims, isMember, locked: d.audience === 'MEMBER_ONLY' && !isMember };
  }

  @Post(':id/claim')
  @UseGuards(UserGuard)
  async claim(@UserId() userId: string, @Param('id') id: string, @Body() dto: ClaimDto) {
    const db = this.prisma.client;
    const qty = dto.qty ?? 1;
    const now = new Date();

    const drop = await db.drop.findUnique({ where: { id } });
    if (!drop || drop.status !== 'OPEN') throw new NotFoundException('종료된 DROP입니다');
    if (drop.closeAt <= now) throw new BadRequestException('마감된 DROP입니다');

    const isMember = await hasActiveMembership(db, userId);

    if (drop.audience === 'MEMBER_ONLY' && !isMember) {
      throw new ForbiddenException('멤버십 회원 전용 DROP입니다');
    }
    if (drop.openAt > now) {
      // 선오픈 구간: 멤버만
      if (!drop.memberPreOpenAt || drop.memberPreOpenAt > now || !isMember) {
        throw new ForbiddenException('아직 오픈 전입니다');
      }
    }

    const already = await db.dropClaim.count({
      where: { dropId: id, userId, status: { in: ['CLAIMED', 'USED', 'RESERVED'] } },
    });
    if (already + qty > drop.maxPerUser) {
      throw new BadRequestException(`1인당 최대 ${drop.maxPerUser}개까지 받을 수 있습니다`);
    }

    const validTo = drop.useWithinDays ? addDays(now, drop.useWithinDays) : drop.closeAt;

    return db.$transaction(async (tx) => {
      // 조건부 차감: remainingQty >= qty 인 행만 갱신된다. 갱신 0건이면 품절.
      const updated = await tx.drop.updateMany({
        where: { id, remainingQty: { gte: qty }, status: 'OPEN' },
        data: { remainingQty: { decrement: qty } },
      });
      if (updated.count === 0) throw new BadRequestException('방금 품절되었습니다');

      const after = await tx.drop.findUniqueOrThrow({ where: { id }, select: { remainingQty: true } });
      if (after.remainingQty === 0) {
        await tx.drop.update({ where: { id }, data: { status: 'SOLD_OUT' } });
      }

      if (drop.kind === 'DEAL') {
        const claim = await tx.dropClaim.create({
          data: { dropId: id, userId, qty, validTo, status: 'CLAIMED' },
        });
        return {
          ok: true,
          type: 'DEAL',
          claimId: claim.id,
          message: '받았습니다! 매장에서 QR을 스캔하고 사용하세요.',
          validTo,
        };
      }

      // TICKET: 주문 + 모의결제 + 이용권 발급
      const amount = drop.dropPrice * qty;
      const order = await tx.order.create({
        data: {
          userId,
          status: 'PAID',
          orderNo: makeOrderNo(),
          totalAmount: amount,
          paidAmount: amount,
          paidAt: now,
          items: {
            create: {
              type: 'DROP',
              refId: drop.id,
              productId: drop.productId,
              name: drop.title,
              unitPrice: drop.dropPrice,
              qty,
              amount,
            },
          },
          payments: {
            create: { provider: 'MOCK', status: 'PAID', amount, method: 'mock', paidAt: now },
          },
        },
      });

      const claim = await tx.dropClaim.create({
        data: { dropId: id, userId, qty, validTo, status: 'RESERVED', orderId: order.id },
      });

      let voucherId: string | null = null;
      if (drop.productId) {
        const voucher = await tx.voucher.create({
          data: {
            userId,
            orderId: order.id,
            productId: drop.productId,
            code: makeVoucherCode(),
            headcount: drop.personsPerUnit * qty,
            validTo,
          },
        });
        voucherId = voucher.id;
      }

      return {
        ok: true,
        type: 'TICKET',
        claimId: claim.id,
        orderNo: order.orderNo,
        paidAmount: amount,
        voucherId,
        message: '결제 완료! 이용권이 발급되었습니다.',
        validTo,
      };
    });
  }
}

@Module({
  imports: [AuthModule],
  controllers: [DropsController],
  providers: [PrismaService],
})
export class DropsModule {}
