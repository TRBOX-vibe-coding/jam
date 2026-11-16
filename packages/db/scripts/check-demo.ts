// 시연 데이터가 12월 31일까지 비지 않았는지 날짜별로 보여 준다 (읽기만 한다): npm run demo:check
import { PrismaClient } from '@prisma/client';
import { DEMO_UNTIL } from './demo-live';
const db = new PrismaClient();
const D = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10) : '-');
const DT = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') : '-');
(async () => {
  const now = new Date();
  const end = DEMO_UNTIL;
  console.log('지금(KST)', DT(now));

  const drops = await db.drop.findMany({ select: { title: true, status: true, openAt: true, closeAt: true, campaignId: true, remainingQty: true, totalQty: true } });
  const open = drops.filter((d) => d.status === 'OPEN' && d.openAt <= now && d.closeAt > now);
  console.log(`DROP 지금 열림 ${open.length}/${drops.length}`);
  for (const d of open) console.log(`   ${d.title} ~${DT(d.closeAt)} ${d.remainingQty}/${d.totalQty}${d.campaignId ? ' [기획전]' : ''}`);

  const camps = await db.campaign.findMany({ select: { title: true, isActive: true, startAt: true, endAt: true } });
  for (const c of camps) console.log(`기획전 ${c.title} ${D(c.startAt)}~${D(c.endAt)}`);

  const dated = await db.product.findMany({ where: { useFrom: { not: null }, isActive: true }, select: { name: true, saleFrom: true, saleTo: true, useFrom: true, totalQty: true, soldQty: true } });
  for (const p of dated) console.log(`날짜 티켓 ${p.name} 판매 ${D(p.saleFrom)}~${D(p.saleTo)} 이용 ${D(p.useFrom)} ${p.soldQty}/${p.totalQty}`);

  // 예약 회차와 예약: 날마다
  const slotAgg = await db.productSlot.aggregate({ where: { startAt: { gt: now } }, _count: true, _max: { startAt: true } });
  console.log(`예약 회차 앞으로 ${slotAgg._count}개, 마지막 ${D(slotAgg._max.startAt)}`);
  const resv = await db.reservation.findMany({ where: { status: 'CONFIRMED', slot: { startAt: { gt: new Date(now.getTime() - 864e5), lte: end } } }, select: { headcount: true, slot: { select: { startAt: true } } } });
  const byDay = new Map<string, number>();
  for (const r of resv) { const k = D(r.slot.startAt); byDay.set(k, (byDay.get(k) ?? 0) + 1); }
  const keys = [...byDay.keys()].sort();
  const days: string[] = [];
  for (let d = new Date(now.getTime() + 9 * 3600_000); d.getTime() < end.getTime() + 9 * 3600_000; d = new Date(d.getTime() + 864e5)) days.push(d.toISOString().slice(0, 10));
  const missing = days.filter((k) => !byDay.has(k));
  console.log(`앞으로 예약 ${resv.length}건, 예약 있는 날 ${keys.length}/${days.length}일, 없는 날: ${missing.join(' ') || '없음'}`);
  console.log('   일별', days.map((k) => `${k.slice(5)}:${byDay.get(k) ?? 0}`).join(' '));

  // 서프홀릭 예약
  const surf = await db.merchant.findFirst({ where: { name: '서프홀릭 송정본점' }, select: { id: true } });
  if (surf) {
    const sr = await db.reservation.count({ where: { status: 'CONFIRMED', product: { merchantId: surf.id }, slot: { startAt: { gt: now, lte: end } } } });
    console.log(`서프홀릭 앞으로 예약 ${sr}건`);
  }

  // 잼
  const plans = await db.membershipPlan.findMany({ where: { price: { gt: 0 } }, select: { id: true, code: true } });
  for (const p of plans) {
    const act = await db.userMembership.count({ where: { planId: p.id, status: 'ACTIVE', endAt: { gt: now } } });
    const start = await db.userMembership.count({ where: { planId: p.id, status: 'ACTIVE', startAt: { gt: now } } });
    const month = await db.userMembership.count({ where: { planId: p.id, source: 'PURCHASE', createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } });
    console.log(`잼 ${p.code}: 이용 중(시작 전 포함) ${act} · 시작 전 ${start} · 이번 달 구매 ${month}`);
  }

  // 최근 14일 일별
  console.log('== 최근 14일 (가입 / 주문 / 잼구매 / 사용 / 서프홀릭 사용 / 딜)');
  for (let back = 13; back >= 0; back--) {
    const from = new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - back * 864e5);
    const to = new Date(from.getTime() + 864e5);
    const [su, od, jm, us, ss, dr] = await Promise.all([
      db.user.count({ where: { createdAt: { gte: from, lt: to } } }),
      db.order.count({ where: { status: 'PAID', paidAt: { gte: from, lt: to } } }),
      db.userMembership.count({ where: { source: 'PURCHASE', createdAt: { gte: from, lt: to }, plan: { price: { gt: 0 } } } }),
      db.redemption.count({ where: { status: 'DONE', createdAt: { gte: from, lt: to } } }),
      surf ? db.redemption.count({ where: { merchantId: surf.id, status: 'DONE', createdAt: { gte: from, lt: to } } }) : 0,
      db.redemption.count({ where: { type: 'DROP', createdAt: { gte: from, lt: to } } }),
    ]);
    console.log(`   ${D(from).slice(5)}  가입 ${su} · 주문 ${od} · 잼 ${jm} · 사용 ${us} · 서프홀릭 ${ss} · 딜 ${dr}`);
  }
  const gm = await db.order.aggregate({ where: { status: 'PAID', paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, _sum: { paidAmount: true }, _count: true });
  console.log(`이번 달 거래액 ${(gm._sum.paidAmount ?? 0).toLocaleString()}원 · ${gm._count}건`);
  const sales48 = surf ? await db.voucher.count({ where: { createdAt: { gte: new Date(now.getTime() - 48 * 3600_000) }, product: { merchantId: surf.id }, reservation: null } }) : 0;
  console.log(`서프홀릭 최근 48시간 이용권 판매 ${sales48}건`);

  // 정산
  const st = await db.settlement.findMany({ orderBy: [{ periodEnd: 'desc' }, { merchantId: 'asc' }], take: 12, select: { periodStart: true, periodEnd: true, status: true, netAmount: true, heldAt: true, merchant: { select: { name: true } } } });
  for (const s of st) console.log(`정산 ${D(s.periodStart)}~${D(s.periodEnd)} ${s.status}${s.heldAt ? '(보류)' : ''} ${s.merchant.name} ${s.netAmount.toLocaleString()}`);
  const ads = await db.adSlot.findMany({ select: { startAt: true, endAt: true } });
  console.log(`광고 ${ads.length}자리 · 지금 걸림 ${ads.filter((a) => a.startAt <= now && a.endAt >= now).length}`);
  const audit = await db.auditLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 9 * 864e5) } } });
  console.log(`감사 로그 최근 9일 ${audit}건`);

  // 시연 손님
  const d1 = await db.user.findFirst({ where: { providerId: 'demo-user-1' }, select: { id: true } });
  if (d1) {
    const up = await db.reservation.findMany({ where: { userId: d1.id, status: 'CONFIRMED', slot: { startAt: { gt: now } } }, select: { slot: { select: { startAt: true, product: { select: { name: true } } } } }, orderBy: { slot: { startAt: 'asc' } } });
    console.log('시연 손님 앞으로 예약', up.map((u) => `${DT(u.slot.startAt)} ${u.slot.product.name.slice(0, 6)}`).join(' | '));
    const vs = await db.voucher.findMany({ where: { userId: d1.id, status: 'ISSUED', validTo: { gt: now } }, select: { validFrom: true, validTo: true, product: { select: { name: true } } } });
    console.log('시연 손님 쓸 수 있는 이용권', vs.map((v) => `${v.product.name.slice(0, 10)}(${D(v.validTo)}까지)`).join(' | '));
    const trip = await db.trip.findUnique({ where: { userId: d1.id } });
    console.log('시연 손님 여행', trip ? `${D(trip.startDate)}~${D(trip.endDate)}` : '없음');
  }
  const pop = await db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Redemption" r WHERE r.type = 'BENEFIT' AND r.status = 'DONE' AND r."createdAt" > ${new Date(now.getTime() - 30 * 864e5)}`;
  console.log('최근 30일 쿠폰 사용', pop[0].n);
  await db.$disconnect();
})();
