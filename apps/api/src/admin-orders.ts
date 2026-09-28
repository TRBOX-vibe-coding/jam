/**
 * 주문·취소 — 2026-09-28 대표 확정 'C 방식'.
 *
 * 손님은 앱에서 직접 취소하지 않는다. 대표는 "추후 손님취소로 해도 괜찮음"이라고 했을 뿐 넣기로 한 것은
 * 아니다 — 필요해지면 그때 만든다. 지금은 손님이 카카오톡·전화로 요청하면 본사가
 *   1) 토스 상점관리자에서 환불하고
 *   2) 여기서 '취소'를 눌러 홀릭잼에 기록한다.
 * 취소를 누르면 예약 자리·판매 수량·딜 수량을 되돌리고, 딸려 받은 쿠폰을 거둬들인다.
 *
 * 정산은 가게에서 이용권을 '사용 처리'한 건만 센다(admin.ts settlements/generate). 사용한 이용권은 취소가
 * 막혀 있으므로, 취소된 건은 따로 빼지 않아도 정산에 들어가지 않는다.
 *
 * 대표 걱정(9/28): "가게에서 쓰고 사장님이 사용 처리를 안 해서 환불받으면?" — 본사가 환불 전에 가게에
 * 확인하도록 취소 창에 늘 안내하고, 이용 시각이 지난 예약은 따로 경고한다.
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AdminGuard, AdminId, AuthModule } from './auth';
import {
  REFUND_POLICY_KEY, getRefundPolicy, reservationRule, undatedRule,
  type RefundPolicy, type RefundRule,
} from './refund-policy.util';

class RefundPolicyDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(1440) graceMinutes!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) sameDayPercent!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) dayBeforePercent!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) twoDaysBeforePercent!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(24) undatedMonths!: number;
  @IsOptional() @IsString() @MaxLength(80) csContact?: string;
  @IsOptional() @IsString() @MaxLength(300) csLink?: string;
}

class CancelOrderDto {
  @Type(() => Number) @IsInt() @Min(0) refundAmount!: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

const DAY = 24 * 60 * 60 * 1000;

const ORDER_INCLUDE = {
  user: { select: { id: true, nickname: true, phone: true } },
  items: true,
  payments: { select: { method: true, provider: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
  vouchers: {
    include: {
      product: {
        select: { id: true, name: true, type: true, totalQty: true, isActive: true, merchant: { select: { name: true } } },
      },
      reservation: { include: { slot: { select: { id: true, startAt: true } } } },
    },
  },
  memberships: { include: { plan: { select: { id: true, name: true } } } },
  claims: { include: { drop: { select: { id: true, title: true, merchant: { select: { name: true } } } } } },
};

const fmt = (d: Date) =>
  new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 목록 한 줄 — 누가, 무엇을, 언제 쓰는지 */
function summarize(o: any) {
  const resv = o.vouchers.find((v: any) => v.reservation)?.reservation ?? null;
  const kind = o.vouchers.length
    ? resv ? '예약' : '이용권'
    : o.memberships.length ? '잼' : o.claims.length ? '딜' : '기타';
  const merchant =
    o.vouchers[0]?.product.merchant.name ?? o.claims[0]?.drop.merchant.name ?? (o.memberships.length ? '홀릭잼' : '');
  const useAt = resv?.slot.startAt ?? o.memberships[0]?.startAt ?? null;
  return {
    id: o.id,
    orderNo: o.orderNo,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    status: o.status,
    cancelledAt: o.cancelledAt,
    refundAmount: o.refundAmount,
    cancelReason: o.cancelReason,
    kind,
    title: o.items.map((i: any) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(', '),
    merchant,
    customer: resv?.contactName || o.user.nickname,
    phone: resv?.contactPhone || o.user.phone || null,
    useAt,
    amount: o.paidAmount || o.totalAmount,
  };
}

/** 이 주문 안에서 한 항목이 차지한 금액. 못 찾으면 주문 전체 금액 */
function partAmount(o: any, match: (i: any) => boolean): number {
  const it = o.items.find(match);
  return it ? it.amount : o.paidAmount || o.totalAmount;
}

type Part = { label: string; amount: number; rule: RefundRule };

/** 취소할 수 있는지, 얼마를 돌려주는 게 규정인지 */
async function analyze(db: PrismaService['client'], o: any, policy: RefundPolicy, now: Date) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const parts: Part[] = [];
  const inGrace = !!o.paidAt && now.getTime() - new Date(o.paidAt).getTime() <= policy.graceMinutes * 60_000;

  if (o.status === 'CANCELLED' || o.status === 'REFUNDED') blockers.push('이미 취소된 주문입니다.');
  else if (o.status !== 'PAID') blockers.push('결제가 끝나지 않은 주문입니다.');

  // 이용권 — 예약 상품은 이용일 기준, 날짜 없는 티켓·PASS는 구매일 기준
  for (const v of o.vouchers) {
    if (v.status === 'CANCELLED') continue;
    if (v.status === 'USED' || v.usedAt) {
      blockers.push(`'${v.product.name}'은(는) 가게에서 이미 사용 처리되었습니다.`);
      continue;
    }
    const amount = partAmount(o, (i) => i.productId === v.productId);
    if (v.reservation) {
      const useAt = new Date(v.reservation.slot.startAt);
      if (useAt <= now) {
        warnings.push(`이용 시각(${fmt(useAt)})이 이미 지났습니다. 손님이 다녀갔는지 가게에 먼저 확인하세요.`);
      }
      parts.push({
        label: `${v.product.name} · ${fmt(useAt)} · ${v.reservation.headcount}명`,
        amount,
        rule: reservationRule(policy, useAt, o.paidAt ? new Date(o.paidAt) : null, now),
      });
    } else {
      parts.push({ label: v.product.name, amount, rule: undatedRule(policy, o.paidAt ? new Date(o.paidAt) : null, now) });
    }
  }

  // 딸려 받은 쿠폰 — 하나라도 쓰면 그 상품은 취소 안 됨 (9/28 대표 확정)
  const productIds = [...new Set<string>(o.vouchers.filter((v: any) => v.status !== 'CANCELLED').map((v: any) => v.productId))];
  if (productIds.length) {
    const used = await db.userBenefit.findMany({
      where: { userId: o.userId, sourceType: 'PRODUCT', sourceId: { in: productIds }, usedCount: { gt: 0 } },
      include: { benefit: { select: { title: true } } },
    });
    for (const u of used) blockers.push(`함께 받은 쿠폰 '${u.benefit.title}'을(를) 이미 써서 취소할 수 없습니다.`);
  }

  // 잼 — 시작일 전이면 전액, 시작한 뒤에는 환불 없음 (결제 직후 시간 안이면 전액)
  for (const m of o.memberships) {
    if (m.status === 'CANCELLED') continue;
    const amount = partAmount(o, (i) => i.type === 'MEMBERSHIP' && i.refId === m.planId);
    const started = new Date(m.startAt) <= now;
    if (started && !inGrace) {
      blockers.push(`'${m.plan.name}'은(는) ${fmt(m.startAt)}에 시작해서 환불되지 않습니다.`);
      continue;
    }
    parts.push({
      label: `${m.plan.name} · 시작 ${fmt(m.startAt)}`,
      amount,
      rule: started
        ? { percent: 100, reason: `결제 후 ${policy.graceMinutes}분 안에 취소 — 전액` }
        : { percent: 100, reason: '시작일 전 취소 — 전액' },
    });
  }

  // 결제한 딜 — 날짜 없는 티켓과 같은 규정
  for (const c of o.claims) {
    if (c.status === 'CANCELLED' || c.status === 'REFUNDED') continue;
    if (c.status === 'USED' || c.usedAt) {
      blockers.push(`딜 '${c.drop.title}'은(는) 가게에서 이미 사용되었습니다.`);
      continue;
    }
    parts.push({
      label: `딜 · ${c.drop.title}`,
      amount: partAmount(o, (i) => i.type === 'DROP' && i.refId === c.dropId),
      rule: undatedRule(policy, o.paidAt ? new Date(o.paidAt) : null, now),
    });
  }

  const suggested = parts.reduce((s, p) => s + Math.floor((p.amount * p.rule.percent) / 100), 0);
  return { blockers, warnings, parts, suggested, productIds };
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminOrdersController {
  constructor(private prisma: PrismaService) {}

  private audit(adminId: string, action: string, targetType: string, targetId: string, memo?: string) {
    return this.prisma.client.auditLog.create({
      data: { adminUserId: adminId, action, targetType, targetId, memo },
    });
  }

  // ── 취소·환불 규정 (설정 화면) ──────────────────────────────

  @Get('settings/refund-policy')
  refundPolicy() {
    return getRefundPolicy(this.prisma.client);
  }

  @Put('settings/refund-policy')
  async saveRefundPolicy(@AdminId() adminId: string, @Body() dto: RefundPolicyDto) {
    const value: RefundPolicy = {
      graceMinutes: dto.graceMinutes,
      sameDayPercent: dto.sameDayPercent,
      dayBeforePercent: dto.dayBeforePercent,
      twoDaysBeforePercent: dto.twoDaysBeforePercent,
      undatedMonths: dto.undatedMonths,
      csContact: dto.csContact?.trim() ?? '',
      csLink: dto.csLink?.trim() ?? '',
    };
    await this.prisma.client.setting.upsert({
      where: { key: REFUND_POLICY_KEY },
      update: { value },
      create: { key: REFUND_POLICY_KEY, value },
    });
    await this.audit(adminId, 'REFUND_POLICY_UPDATE', 'Setting', REFUND_POLICY_KEY, JSON.stringify(value));
    return { ok: true, message: '취소·환불 규정을 저장했습니다. 앱 안내에도 바로 반영됩니다.', policy: value };
  }

  // ── 주문 찾기 · 취소 ─────────────────────────────────────

  /** 주문 목록 — 주문번호·손님 이름·연락처로 찾는다 */
  @Get('orders')
  async orders(@Query('q') q?: string, @Query('days') days?: string) {
    const since = new Date(Date.now() - (Number(days) || 90) * DAY);
    const term = q?.trim();
    const where: any = { status: { in: ['PAID', 'CANCELLED', 'REFUNDED'] }, createdAt: { gte: since } };
    if (term) {
      where.OR = [
        { orderNo: { contains: term, mode: 'insensitive' } },
        { user: { nickname: { contains: term } } },
        { user: { phone: { contains: term } } },
        { vouchers: { some: { reservation: { is: { OR: [{ contactName: { contains: term } }, { contactPhone: { contains: term } }] } } } } },
      ];
    }
    const rows = await this.prisma.client.order.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100, include: ORDER_INCLUDE,
    });
    return rows.map(summarize);
  }

  /** 취소 전에 보여줄 것 — 막히는 이유, 규정상 돌려줄 금액 */
  @Get('orders/:id/cancel-preview')
  async cancelPreview(@Param('id') id: string) {
    const db = this.prisma.client;
    const o = await db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!o) throw new NotFoundException('주문을 찾을 수 없습니다');
    const policy = await getRefundPolicy(db);
    const a = await analyze(db, o, policy, new Date());
    return {
      order: summarize(o),
      paid: o.paidAmount || o.totalAmount,
      blockers: a.blockers,
      warnings: a.warnings,
      parts: a.parts.map((p) => ({
        label: p.label,
        amount: p.amount,
        percent: p.rule.percent,
        reason: p.rule.reason,
        refund: Math.floor((p.amount * p.rule.percent) / 100),
      })),
      suggested: a.suggested,
    };
  }

  /** 취소 처리 — 토스에서 환불한 뒤 누른다 */
  @Post('orders/:id/cancel')
  async cancel(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    const db = this.prisma.client;
    const o: any = await db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!o) throw new NotFoundException('주문을 찾을 수 없습니다');
    const now = new Date();
    const policy = await getRefundPolicy(db);
    const a = await analyze(db, o, policy, now);
    if (a.blockers.length) throw new BadRequestException(a.blockers[0]);

    const paid = o.paidAmount || o.totalAmount;
    if (dto.refundAmount > paid) throw new BadRequestException(`돌려준 금액이 결제 금액(${paid.toLocaleString()}원)보다 클 수 없습니다`);

    const soldOutNotes: string[] = [];

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: now, refundAmount: dto.refundAmount, cancelReason: dto.reason?.trim() || null },
      });

      for (const v of o.vouchers) {
        if (v.status === 'CANCELLED') continue;
        await tx.voucher.update({ where: { id: v.id }, data: { status: 'CANCELLED' } });
        if (v.reservation) {
          // 예약 자리 되돌리기 — 그 시간대에 다른 손님이 다시 예약할 수 있게
          await tx.reservation.update({ where: { id: v.reservation.id }, data: { status: 'CANCELLED', cancelledAt: now } });
          await tx.$executeRaw`
            UPDATE "ProductSlot" SET "reserved" = GREATEST("reserved" - ${v.reservation.headcount}, 0)
            WHERE "id" = ${v.reservation.slotId}`;
        } else if (v.product.totalQty != null) {
          // 판매 수량 되돌리기 — 결제할 때 1장씩 올렸다(orders.ts)
          await tx.$executeRaw`
            UPDATE "Product" SET "soldQty" = GREATEST("soldQty" - 1, 0)
            WHERE "id" = ${v.productId}`;
          if (!v.product.isActive) soldOutNotes.push(v.product.name);
        }
      }

      // 딸려 받은 쿠폰 거둬들이기. 쿠폰은 상품마다 한 벌이라, 같은 상품을 또 산 이용권이 살아 있으면 그대로 둔다.
      for (const pid of a.productIds) {
        const other = await tx.voucher.count({
          where: { userId: o.userId, productId: pid, orderId: { not: o.id }, status: { in: ['ISSUED', 'RESERVED', 'USED'] } },
        });
        if (other > 0) continue;
        await tx.userBenefit.updateMany({
          where: { userId: o.userId, sourceType: 'PRODUCT', sourceId: pid, status: { in: ['PENDING', 'ACTIVE'] } },
          data: { status: 'REVOKED' },
        });
      }

      for (const m of o.memberships) {
        if (m.status === 'CANCELLED') continue;
        await tx.userMembership.update({ where: { id: m.id }, data: { status: 'CANCELLED' } });
      }

      for (const c of o.claims) {
        if (c.status === 'CANCELLED' || c.status === 'REFUNDED') continue;
        await tx.dropClaim.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
        await tx.$executeRaw`
          UPDATE "Drop" SET "remainingQty" = LEAST("remainingQty" + ${c.qty}, "totalQty")
          WHERE "id" = ${c.dropId}`;
      }
    });

    await this.audit(
      adminId, 'ORDER_CANCEL', 'Order', id,
      `${o.orderNo} · 환불 ${dto.refundAmount.toLocaleString()}원 (규정 ${a.suggested.toLocaleString()}원)${dto.reason ? ' · ' + dto.reason : ''}`,
    );

    const notes = [`${o.orderNo} 취소했습니다. 예약 자리와 판매 수량을 되돌렸고, 함께 받은 쿠폰을 거둬들였습니다.`];
    if (soldOutNotes.length) {
      notes.push(`'${soldOutNotes.join(', ')}'은(는) 품절로 판매가 꺼져 있습니다. 다시 팔려면 상품 화면에서 켜 주세요.`);
    }
    return { ok: true, message: notes.join(' ') };
  }
}

/** 앱이 결제 전에 보여주는 취소·환불 안내 — 로그인 없이 읽는다 */
@Controller('policy')
export class PolicyController {
  constructor(private prisma: PrismaService) {}

  @Get('refund')
  refund() {
    return getRefundPolicy(this.prisma.client);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminOrdersController, PolicyController],
  providers: [PrismaService],
})
export class AdminOrdersModule {}
