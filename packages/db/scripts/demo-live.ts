/**
 * 시연 데이터 — 12월 말까지 살아 있게 채우기 + 오늘의 활동 채우기 (2026-11-16).
 *
 * refresh-demo.ts가 '지금 기준으로 다시 여는' 일을 한다면, 이 파일은 그 위에서
 *  ① 끝나는 날이 있는 것들(기획전·광고·날짜 있는 티켓·DROP)을 12월 31일까지 늘리고
 *  ② 앞으로의 예약을 12월 31일까지 날마다 채우고            (점주 달력·본사 예약 목록)
 *  ③ 최근 14일의 가입·결제·사용 기록이 날마다 있게 채우고   (본사 대시보드·점주 대시보드·인기 쿠폰)
 *  ④ 지난 정산 기간의 정산을 만들고, 본사 감사 로그를 채운다.
 *
 * 구매·예약·잼·사용은 앱과 똑같은 경로(API)로 만든다. 그래야 주문·결제·이용권·쿠폰 열림이 빠지지 않는다.
 * API가 만든 시각은 '지금'이라, 정한 시각으로 되돌려 쓴다(backdate).
 * 몇 번을 돌려도 된다 — 모자란 날만 채우고, 이미 채운 날은 건드리지 않는다. 실서비스 DB에는 돌리지 않는다.
 */
import type { PrismaClient } from '@prisma/client';
import { endedPeriods, getSettlementPolicy, saveSettlements } from '../../../apps/api/src/settlement.util';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const API = process.env.API_URL || 'http://localhost:4000';

/** 시연 데이터를 살려 둘 마지막 날 */
export const DEMO_UNTIL = new Date('2026-12-31T23:59:59+09:00');

// ───────────── 도구 ─────────────
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const atTime = (d: Date, h: number, m: number) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

/** 같은 입력이면 같은 수열 — 몇 번 돌려도 같은 날은 같은 모양 */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rnd = () => number;
const between = (r: Rnd, a: number, b: number) => a + r() * (b - a);
const int = (r: Rnd, a: number, b: number) => Math.floor(between(r, a, b + 1));
const pick = <T,>(r: Rnd, xs: T[]): T => xs[Math.floor(r() * xs.length)];
function weighted<T>(r: Rnd, xs: [T, number][]): T {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of xs) { x -= w; if (x <= 0) return v; }
  return xs[xs.length - 1][0];
}

type Ctx = { db: PrismaClient; now: Date; until: Date; alive: boolean };

async function http(path: string, opts: { token?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const r = await fetch(`${API}${path}`, {
      method: opts.body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json: any = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  } catch {
    return { ok: false, status: 0, json: {} };
  }
}

async function login(providerId: string, nickname: string): Promise<string | null> {
  const r = await http('/auth/social', { body: { provider: 'KAKAO', providerId, nickname } });
  return r.json?.token ?? null;
}

// ───────────── 시연 손님 ─────────────
const NICKS = [
  '바다좋아', '광안리노을', '해운대보이', '서핑초보92', '카페투어러', '주말여행자', '혼행족', '바다멍', '야경수집가', '먹방여행',
  '액티비티왕', '맛집헌터', '여행계획러', '가족여행', '커플여행', '워케이션', '서면직장인', '한달살이', '남포동산책', '송정러버',
  '부산처음', '다낭가는길', '새벽러너', '노을맛집', '요트타고싶다', '디저트러버', '비치런', '야시장탐방', '부산댁', '로컬탐험',
  '해변산책', '사진찍는여행', '출장겸여행', '동백섬러', '민락수변', '이기대트레킹', '감천문화', '자갈치아침', '기장미역', '청사포에서',
  '영도카페', '부산진시장', '북항야경', '다대포노을', '오륙도', '태종대바람', '대연동', '수영구민', '해리단길', '전포카페',
  '밀면러버', '돼지국밥', '씨앗호떡', '부산갈매기', '가덕도', '일광해변', '송도케이블', '흰여울마을', '곱창골목', '서핑홀릭',
];
const phoneOf = (n: number) => `010-${String(2000 + ((n * 7919) % 7000)).padStart(4, '0')}-${String(1000 + ((n * 104729) % 8999)).padStart(4, '0')}`;
const liveId = (n: number) => `demo-live-${String(n).padStart(2, '0')}`;
const LIVE_COUNT = NICKS.length;

/** 시연 예약자 — refresh-demo.ts와 같은 사람들 (demo-guest-1~8) */
const GUESTS: [string, string][] = [
  ['김민서', '010-2431-8870'], ['박도윤', '010-3372-1154'], ['이서아', '010-8845-2207'], ['최지호', '010-5519-6642'],
  ['정하윤', '010-2277-9031'], ['한수빈', '010-6604-3318'], ['오재현', '010-9912-4457'], ['임규원', '010-3048-7762'],
];

type Person = { providerId: string; nickname: string; phone: string };
const guestPerson = (i: number): Person => ({ providerId: `demo-guest-${i + 1}`, nickname: GUESTS[i][0], phone: GUESTS[i][1] });
const livePerson = (n: number): Person => ({ providerId: liveId(n), nickname: NICKS[(n - 1) % NICKS.length], phone: phoneOf(n) });

// ───────────── 되돌려 쓰기 (backdate) ─────────────
/** 사용자 한 명의 기록 가운데 since 이후에 생긴 것의 시각을 deltaMs만큼 앞당긴다. 열고 닫는 기한은 건드리지 않는다. */
async function backdateUser(db: PrismaClient, userId: string, since: Date, deltaMs: number, opts: { keepValidity?: boolean } = {}) {
  if (deltaMs <= 0) return 0;
  const ms = Math.round(deltaMs);
  // 저장된 시각은 '협정세계시 벽시계 값'(timestamp)이고 DB 시간대는 한국이라, Date를 그대로 비교하면 9시간 어긋난다.
  // 그래서 기준 시각을 문자열로 넘겨 timestamptz로 읽은 뒤 UTC 벽시계 값으로 바꿔서 비교한다.
  const sinceIso = since.toISOString();
  let changed = 0;
  const q = async (sql: string) => { changed += await db.$executeRawUnsafe(sql, userId, sinceIso, ms); };
  await q(`UPDATE "Order" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond'), "paidAt" = "paidAt" - ($3 * interval '1 millisecond'), "agreedAt" = "agreedAt" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  await q(`UPDATE "Payment" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond'), "paidAt" = "paidAt" - ($3 * interval '1 millisecond') WHERE "orderId" IN (SELECT id FROM "Order" WHERE "userId" = $1) AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  await q(`UPDATE "Voucher" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond'), "validFrom" = LEAST("validFrom", "createdAt" - ($3 * interval '1 millisecond')), "usedAt" = "usedAt" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  await q(`UPDATE "Reservation" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  await q(`UPDATE "Redemption" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond'), "verifyExpires" = "verifyExpires" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  await q(`UPDATE "EventLog" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  await q(`UPDATE "UserMembership" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  if (opts.keepValidity) {
    await q(`UPDATE "UserBenefit" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  } else {
    // 쓰면서 열린 쿠폰·잼으로 받은 쿠폰은 열린 시각도 함께 당긴다
    await q(`UPDATE "UserBenefit" SET "createdAt" = "createdAt" - ($3 * interval '1 millisecond'), "validFrom" = "validFrom" - ($3 * interval '1 millisecond'), "validTo" = "validTo" - ($3 * interval '1 millisecond') WHERE "userId" = $1 AND "createdAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`);
  }
  return changed;
}

/** 가입 시각을 되돌린다 */
async function backdateUserRow(db: PrismaClient, userId: string, createdAt: Date, phone?: string) {
  await db.user.update({ where: { id: userId }, data: { createdAt, lastLoginAt: new Date(Math.max(createdAt.getTime(), Date.now() - 3 * HOUR)), ...(phone ? { phone } : {}) } });
}

// ───────────── ① 끝나는 날이 있는 것들 늘리기 ─────────────
const DATED: { name: string; useDay: string; price: [number, number]; qty: number; desc: string; image: string; commission: number | null }[] = [
  { name: '크리스마스 이브 야경 선상 크루즈', useDay: '2026-12-24', price: [59000, 49000], qty: 40, desc: '크리스마스 이브 저녁, 해운대 앞바다에서 배 위로 보는 야경 코스. 따뜻한 음료 1잔 포함, 저녁 6시 승선.', image: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=60&auto=format&fit=crop', commission: 15 },
  { name: '송년 카운트다운 선상 크루즈', useDay: '2026-12-31', price: [69000, 55000], qty: 40, desc: '한 해의 마지막 밤, 바다 위에서 카운트다운. 밤 11시 승선, 자정 불꽃과 함께 한 해를 보냅니다.', image: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1200&q=60&auto=format&fit=crop', commission: 15 },
];

async function extendWindows(c: Ctx) {
  const { db, now, until } = c;
  const out: string[] = [];

  // 기획전 — 12월 31일까지. 소속 DROP(기획전 상품)은 기획전과 같이 끝난다
  const camps = await db.campaign.findMany({ where: { isActive: true }, select: { id: true, startAt: true, endAt: true } });
  let nc = 0;
  for (const cp of camps) {
    const data: { startAt?: Date; endAt?: Date } = {};
    if (!cp.startAt || cp.startAt > now) data.startAt = addDays(sod(now), -3);
    if (!cp.endAt || cp.endAt < until) data.endAt = until;
    if (Object.keys(data).length) { await db.campaign.update({ where: { id: cp.id }, data }); nc++; }
  }
  const cdrops = await db.drop.updateMany({
    where: { campaignId: { not: null }, status: { in: ['OPEN', 'CLOSED'] }, closeAt: { lt: until } },
    data: { status: 'OPEN', openAt: addDays(sod(now), -3), closeAt: until },
  });
  out.push(`기획전 ${nc}개 · 기획전 상품 ${cdrops.count}개를 12/31까지`);

  // 승인 대기 DROP — 상태는 그대로 두고, 본사가 언제 승인해도 앱에 보이게 기간만 늘린다
  const pend = await db.drop.updateMany({ where: { status: 'PENDING', closeAt: { lt: until } }, data: { openAt: new Date(now.getTime() - HOUR), closeAt: until } });
  out.push(`승인 대기 DROP ${pend.count}개`);

  // 여유 있는 DROP 두 개는 며칠짜리로 — 새로 고침이 없어도 한동안 열려 있게 (시간이 짧은 것은 refresh가 계속 다시 연다)
  const longDrops: [string, number][] = [['핸드드립+티라미수 브레이크 세트', 12], ['시그니처 칵테일 1+1', 20]];
  for (const [title, days] of longDrops) {
    const r = await db.drop.updateMany({ where: { title }, data: { status: 'OPEN', openAt: new Date(now.getTime() - 2 * HOUR), closeAt: addDays(now, days) } });
    if (r.count) out.push(`${title} ${days}일`);
  }

  // 판매 기간이 12월 안에 끝나는 일반 상품은 늘린다
  const stale = await db.product.updateMany({ where: { isActive: true, campaignId: null, useFrom: null, saleTo: { lt: until, not: null } }, data: { saleTo: null } });
  if (stale.count) out.push(`판매 기간 끝나는 상품 ${stale.count}개 늘림`);

  // 날짜 있는 티켓 — 12월 행사 둘 (이용일은 고정, 판매는 오늘부터 이용 전날까지)
  const merchant = await db.merchant.findFirst({ where: { name: '해운대리버크루즈' }, select: { id: true, categoryId: true } });
  if (merchant) {
    const coupons = await db.benefit.findMany({
      where: { isActive: true, approval: 'ACTIVE', merchant: { name: { in: ['부산엑스더스카이', '스크러피', '뮤지엄원', '씀모이가든'] } } },
      select: { id: true }, take: 4, orderBy: { createdAt: 'asc' },
    });
    for (const [idx, d] of DATED.entries()) {
      const use = new Date(`${d.useDay}T00:00:00+09:00`);
      const saleTo = addDays(use, -1);
      const dates = { saleFrom: sod(now), saleTo, useFrom: use, useTo: use };
      let p = await db.product.findFirst({ where: { name: d.name, merchantId: merchant.id } });
      if (!p) {
        p = await db.product.create({
          data: {
            merchantId: merchant.id, categoryId: merchant.categoryId, type: 'TICKET', name: d.name, description: d.desc, imageUrl: d.image,
            basePrice: d.price[0], memberPrice: d.price[1], totalQty: d.qty, maxPerUser: 4, commissionRate: d.commission,
            cancelPolicy: '기상 악화로 운항하지 않으면 전액 환불', weatherDependent: true, approval: 'ACTIVE', isActive: true, ...dates,
          },
        });
        for (let i = 0; i < 2 && i + idx * 2 < coupons.length; i++) {
          await db.benefitGrantRule.create({ data: { benefitId: coupons[i + idx * 2].id, trigger: 'PRODUCT', productId: p.id, validDays: 3, sortOrder: i, isActive: true } });
        }
        out.push(`날짜 있는 티켓 만듦: ${d.name}`);
      } else if (p.saleFrom && p.saleFrom > now) {
        await db.product.update({ where: { id: p.id }, data: { saleFrom: sod(now) } });
      }
    }
  }

  // 쓸 수 있는 쿠폰 가운데 12월 안에 끝나는 것은 늘린다
  const ub = await db.userBenefit.updateMany({ where: { status: 'ACTIVE', validTo: { gt: now, lt: until } }, data: { validTo: until } });
  if (ub.count) out.push(`곧 끝나는 쿠폰 ${ub.count}장 늘림`);

  // 이용 기한이 지난 채 남은 이용권은 '기간 만료'로 맞춘다
  const exp = await db.voucher.updateMany({ where: { status: 'ISSUED', validTo: { lte: now } }, data: { status: 'EXPIRED' } });
  if (exp.count) out.push(`기한 지난 이용권 ${exp.count}장을 기간 만료로`);

  return out.join(' · ');
}

// ───────────── 광고 자리 ─────────────
async function ensureAds(c: Ctx) {
  const { db, now, until } = c;
  const cats = await db.category.findMany({ select: { id: true, name: true } });
  let made = 0;
  const from = addDays(sod(now), -14);
  for (const cat of cats) {
    const bens = await db.benefit.findMany({
      where: { isActive: true, approval: 'ACTIVE', merchant: { categoryId: cat.id, status: 'ACTIVE' } },
      select: { id: true }, orderBy: { createdAt: 'asc' }, take: 3,
    });
    const prods = await db.product.findMany({
      where: { isActive: true, categoryId: cat.id, approval: 'ACTIVE' },
      select: { id: true }, orderBy: { createdAt: 'asc' }, take: 3,
    });
    for (const [type, items] of [['BENEFIT', bens], ['PRODUCT', prods]] as const) {
      for (let i = 0; i < items.length; i++) {
        const rank = i + 1;
        const key = { categoryId_itemType_rank: { categoryId: cat.id, itemType: type, rank } };
        const have = await db.adSlot.findUnique({ where: key });
        if (have && have.endAt >= until && have.startAt <= now) continue;
        await db.adSlot.upsert({
          where: key,
          update: { refId: have?.refId ?? items[i].id, startAt: from, endAt: until },
          create: { categoryId: cat.id, itemType: type, refId: items[i].id, rank, startAt: from, endAt: until },
        });
        made++;
      }
    }
  }
  return made;
}

// ───────────── 시연 손님 · 잼 ─────────────
/** 가입한 날 — 사람마다 다르게 흩어 둔다 (한 날에 몰려 보이지 않게). 같은 사람은 늘 같은 날 */
function signupAt(p: Person, now: Date): Date {
  let h = 7;
  for (let i = 0; i < p.providerId.length; i++) h = (h * 31 + p.providerId.charCodeAt(i)) >>> 0;
  const r = rng(`signup-${h}`);
  return atTime(addDays(sod(now), -int(r, 8, 55)), int(r, 9, 22), int(r, 0, 59));
}

async function ensureUser(c: Ctx, p: Person, createdAt?: Date): Promise<{ id: string; token: string } | null> {
  const token = await login(p.providerId, p.nickname);
  if (!token) return null;
  const u = await c.db.user.findFirst({ where: { provider: 'KAKAO', providerId: p.providerId }, select: { id: true, createdAt: true, phone: true } });
  if (!u) return null;
  if (createdAt && (u.createdAt.getTime() > createdAt.getTime() || !u.phone)) await backdateUserRow(c.db, u.id, createdAt < u.createdAt ? createdAt : u.createdAt, p.phone);
  return { id: u.id, token };
}

const JAM_PLAN = { JAM3: 3, JAM5: 5, CAFEJAM: 30, DANANG: 5, JAMMASTER: 365 } as const;
type JamCode = keyof typeof JAM_PLAN;

/** 잼을 사고(앱과 같은 경로) 산 시각·시작일을 정한 대로 맞춘다 */
async function buyJamAt(c: Ctx, p: Person, code: JamCode, purchasedAt: Date, startDay: Date): Promise<boolean> {
  const { db, now } = c;
  const u = await ensureUser(c, p, addDays(purchasedAt, -1));
  if (!u) return false;
  const plan = await db.membershipPlan.findUnique({ where: { code } });
  if (!plan) return false;
  const mine = await db.userMembership.findFirst({ where: { userId: u.id, planId: plan.id, source: 'PURCHASE', status: 'ACTIVE' } });
  if (mine) return false; // 이미 있다
  const short = plan.durationDays <= 30;
  const today = sod(now);
  const future = short && startDay.getTime() > today.getTime();
  const since = new Date(Date.now() - 5_000);
  const r = await http('/membership/purchase', {
    token: u.token,
    body: { planCode: code, contactName: p.nickname, contactPhone: p.phone, agreed: true, ...(future ? { startDate: dayKey(startDay) } : {}) },
  });
  if (!r.ok) return false;
  const ms = await db.userMembership.findFirst({ where: { userId: u.id, planId: plan.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
  if (!ms) return false;
  const delta = Date.now() - purchasedAt.getTime();
  await backdateUser(db, u.id, since, delta, { keepValidity: true });
  if (short) {
    const startAt = startDay;
    const endAt = addDays(startAt, plan.durationDays + 1);
    await db.userMembership.update({ where: { id: ms.id }, data: { startAt, endAt } });
    await db.userBenefit.updateMany({ where: { userId: u.id, sourceType: 'MEMBERSHIP_PLAN', sourceId: ms.id }, data: { validFrom: startAt < purchasedAt ? startAt : purchasedAt, validTo: endAt } });
  } else {
    const endAt = new Date(ms.endAt.getTime() - delta);
    const startAt = purchasedAt;
    await db.userMembership.update({ where: { id: ms.id }, data: { startAt, endAt } });
    await db.userBenefit.updateMany({ where: { userId: u.id, sourceType: 'MEMBERSHIP_PLAN', sourceId: ms.id }, data: { validFrom: startAt, validTo: endAt } });
  }
  // 잼 화면을 보고 산 것 — 본사 '잼별 전환율'
  await db.eventLog.create({ data: { userId: u.id, event: 'plan_view', entityType: 'plan', entityId: code, createdAt: new Date(purchasedAt.getTime() - 6 * 60_000) } });
  await db.eventLog.create({ data: { userId: u.id, event: 'plan_purchase', entityType: 'plan', entityId: code, createdAt: purchasedAt } });
  return true;
}

/** 이미 이용 중인 잼 회원들 — 잼마스터 14명(날짜를 나눠 사 둔 사람들)과 기간잼 몇 명 */
async function ensureMembers(c: Ctx) {
  const { now } = c;
  let made = 0;
  // 잼마스터: 10/18 ~ 11/15 사이에 나눠 산 것으로 (쿠폰을 마음껏 쓰는 사람들)
  const masterDays = [-29, -26, -23, -21, -19, -16, -14, -12, -10, -8, -6, -4, -3, -1];
  for (let i = 0; i < masterDays.length; i++) {
    const r = rng(`member-${i}`);
    const when = atTime(addDays(sod(now), masterDays[i]), int(r, 9, 20), int(r, 0, 59));
    if (await buyJamAt(c, livePerson(i + 1), 'JAMMASTER', when, when)) made++;
  }
  // 기간잼: 끝난 것·이용 중인 것·12월에 시작하는 것
  const short: { n: number; code: JamCode; boughtDay: number; startDay: number }[] = [
    { n: 15, code: 'JAM3', boughtDay: -14, startDay: -12 },
    { n: 16, code: 'JAM5', boughtDay: -11, startDay: -9 },
    { n: 17, code: 'CAFEJAM', boughtDay: -9, startDay: -8 },
    { n: 18, code: 'JAM3', boughtDay: -5, startDay: -4 },
    { n: 19, code: 'JAM5', boughtDay: -4, startDay: -2 },
    { n: 20, code: 'DANANG', boughtDay: -3, startDay: 0 },
    { n: 21, code: 'JAM3', boughtDay: -2, startDay: 1 },
    { n: 22, code: 'JAM5', boughtDay: -2, startDay: 5 },
    { n: 23, code: 'CAFEJAM', boughtDay: -1, startDay: 2 },
    { n: 24, code: 'DANANG', boughtDay: -6, startDay: 12 },
    { n: 25, code: 'JAM3', boughtDay: -7, startDay: 19 },
    { n: 26, code: 'JAM5', boughtDay: -3, startDay: 28 },
    { n: 27, code: 'JAM3', boughtDay: -1, startDay: 33 },
    { n: 28, code: 'DANANG', boughtDay: -5, startDay: 40 },
  ];
  for (const s of short) {
    const r = rng(`short-${s.n}`);
    const when = atTime(addDays(sod(now), s.boughtDay), int(r, 9, 21), int(r, 0, 59));
    const start = addDays(sod(now), s.startDay);
    if (start.getTime() > c.until.getTime()) continue;
    if (await buyJamAt(c, livePerson(s.n), s.code, when, start)) made++;
  }
  return made;
}

// ───────────── ② 앞으로의 예약 채우기 (12월 31일까지 날마다) ─────────────
/** 예약을 넣을 때 쓸 사람 — 시연 예약자 8명 + 시연 손님 29번부터 */
function bookerPool(): Person[] {
  const xs: Person[] = GUESTS.map((_, i) => guestPerson(i));
  for (let n = 29; n <= LIVE_COUNT; n++) xs.push(livePerson(n));
  return xs;
}

async function fillFutureReservations(c: Ctx) {
  const { db, now, until } = c;
  if (!c.alive) return { created: 0, skipped: true };
  const rFor = (k: string) => rng(`resv-${k}`);

  const slots = await db.productSlot.findMany({
    where: { isOpen: true, startAt: { gt: new Date(now.getTime() + HOUR), lte: until }, product: { isActive: true, type: 'RESERVATION' } },
    orderBy: { startAt: 'asc' },
    select: { id: true, productId: true, startAt: true, capacity: true, reserved: true },
  });
  const have = await db.reservation.findMany({
    where: { status: 'CONFIRMED', slot: { startAt: { gt: now, lte: until } } },
    select: { slot: { select: { startAt: true } } },
  });
  const haveByDay = new Map<string, number>();
  for (const h of have) { const k = dayKey(h.slot.startAt); haveByDay.set(k, (haveByDay.get(k) ?? 0) + 1); }

  const byDay = new Map<string, typeof slots>();
  for (const s of slots) { const k = dayKey(s.startAt); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(s); }

  const pool = bookerPool();
  let created = 0;
  const days = Math.ceil((until.getTime() - sod(now).getTime()) / DAY);
  const tokens = new Map<string, { id: string; token: string }>();

  for (let d = 0; d <= days; d++) {
    const day = addDays(sod(now), d);
    const key = dayKey(day);
    const daySlots = byDay.get(key);
    if (!daySlots?.length) continue;
    const r = rFor(key);
    const dow = day.getDay();
    const weekend = dow === 0 || dow === 6;
    const holiday = ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31'].includes(key);
    const decay = d <= 7 ? 1 : d <= 21 ? 0.8 : 0.55;
    const target = Math.max(2, Math.round(((weekend ? 6 : 3.5) + (holiday ? 3 : 0)) * decay + between(r, -0.5, 1)));
    let need = target - (haveByDay.get(key) ?? 0);
    if (need <= 0) continue;
    // 상품이 골고루 차도록 회차를 섞어 돌려 가며 고른다
    const order = [...daySlots].sort(() => r() - 0.5);
    let guard = 0;
    while (need > 0 && guard++ < 30) {
      const s = order[guard % order.length];
      const headcount = weighted(r, [[1, 3], [2, 5], [3, 2], [4, 1]]);
      if (s.reserved + headcount > s.capacity) continue;
      const person = pick(r, pool);
      let who = tokens.get(person.providerId);
      if (!who) {
        const u = await ensureUser(c, person, signupAt(person, now));
        if (!u) continue;
        tokens.set(person.providerId, u);
        who = u;
      }
      const since = new Date(Date.now() - 3_000);
      const res = await http(`/products/${s.productId}/purchase`, {
        token: who.token,
        body: { slotId: s.id, headcount, contactName: person.nickname, contactPhone: person.phone, agreed: true },
      });
      if (!res.ok) continue;
      s.reserved += headcount;
      created++; need--;
      haveByDay.set(key, (haveByDay.get(key) ?? 0) + 1);
      // 예약한 시각 — 이용일 며칠 전, 낮 시간. 오늘 막 넣은 것처럼 보이지 않게 과거로
      const lead = between(r, 0.6, 12);
      let bookedAt = new Date(s.startAt.getTime() - lead * DAY);
      const latest = new Date(now.getTime() - between(r, 1, 30) * HOUR);
      if (bookedAt.getTime() > latest.getTime()) bookedAt = new Date(now.getTime() - between(r, 2, 14 * 24) * HOUR);
      if (bookedAt.getTime() < now.getTime() - 24 * DAY) bookedAt = new Date(now.getTime() - between(r, 12, 24) * DAY);
      bookedAt = atTime(bookedAt, int(r, 8, 22), int(r, 0, 59));
      if (bookedAt.getTime() > latest.getTime()) bookedAt = new Date(latest);
      await backdateUser(db, who.id, since, Date.now() - bookedAt.getTime(), { keepValidity: true });
    }
  }
  return { created, skipped: false };
}

// ───────────── ③ 최근 14일의 가입·결제·사용 ─────────────
const TICKET_WEIGHTS: [string, number][] = [
  ['송정 바다 PASS', 5],
  ['해운대 리버크루즈 탑승권', 3],
  ['콩고 시그니처 세트 교환권 (음료+디저트)', 2],
  ['바나힐 케이블카 입장권', 1],
];

/** 하루에 이만큼은 있어야 한다 — 요일에 따라 다르게 */
function dayTargets(day: Date, r: Rnd, fraction: number) {
  const dow = day.getDay();
  const base = [8, 5, 5, 5, 6, 8, 11][dow];
  const orders = Math.round(base * between(r, 0.85, 1.25) * fraction);
  const uses = Math.round(base * 0.85 * between(r, 0.8, 1.2) * fraction);
  const signups = Math.round((dow === 0 || dow === 6 ? 3 : 2) * between(r, 0.7, 1.4) * fraction);
  const jams = Math.round((dow === 5 || dow === 6 ? 2 : 1) * between(r, 0.5, 1.5) * fraction);
  return { orders, uses, signups, jams };
}

type DayCounts = { orders: number; uses: number; signups: number; jams: number; views: number };
async function countsOfDay(db: PrismaClient, from: Date, to: Date): Promise<DayCounts> {
  const [orders, uses, signups, jams, views] = await Promise.all([
    db.order.count({ where: { status: 'PAID', paidAt: { gte: from, lt: to } } }),
    db.redemption.count({ where: { status: 'DONE', createdAt: { gte: from, lt: to } } }),
    db.user.count({ where: { createdAt: { gte: from, lt: to } } }),
    db.userMembership.count({ where: { source: 'PURCHASE', createdAt: { gte: from, lt: to }, plan: { price: { gt: 0 } } } }),
    db.eventLog.count({ where: { event: 'plan_view', createdAt: { gte: from, lt: to } } }),
  ]);
  return { orders, uses, signups, jams, views };
}

/** 하루 안의 시각 — 점심·저녁에 몰리게. 아직 안 온 시각이면 null */
function timeInDay(day: Date, r: Rnd, now: Date, lo = 9.5, hi = 22): Date | null {
  const h = weighted(r, [[10, 2], [11, 3], [12, 4], [13, 3], [14, 3], [15, 3], [16, 3], [17, 3], [18, 4], [19, 4], [20, 3], [21, 2]]);
  const t = atTime(day, Math.min(Math.max(h, Math.floor(lo)), Math.floor(hi)), int(r, 0, 59));
  const limit = now.getTime() - 5 * 60_000;
  if (t.getTime() <= limit) return t;
  // 오늘 아직 안 온 시각이면, 문 연 뒤부터 5분 전까지 안의 아무 때로 당긴다
  const from = atTime(day, Math.floor(lo), 0).getTime();
  if (limit <= from) return null;
  return new Date(from + Math.floor(r() * (limit - from)));
}

async function fillLiveActivity(c: Ctx) {
  const { db, now } = c;
  const tot = { orders: 0, uses: 0, signups: 0, jams: 0, drops: 0, views: 0, fails: {} as Record<string, number> };
  const miss = (why: string) => { tot.fails[why] = (tot.fails[why] ?? 0) + 1; return false; };
  if (!c.alive) return tot;

  const merchants = await db.merchant.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, usePin: true } });
  const pinOf = new Map(merchants.map((m) => [m.id, m.usePin]));
  const products = await db.product.findMany({
    where: { isActive: true, type: { in: ['PASS', 'TICKET'] }, useFrom: null, campaignId: null },
    select: { id: true, name: true, merchantId: true },
  });
  const tickets: [(typeof products)[number], number][] = [];
  for (const [n, w] of TICKET_WEIGHTS) { const p = products.find((x) => x.name === n); if (p) tickets.push([p, w]); }
  const masters = await db.userMembership.findMany({
    where: { status: 'ACTIVE', plan: { code: 'JAMMASTER' }, user: { providerId: { startsWith: 'demo-live-' } } },
    select: { startAt: true, endAt: true, user: { select: { id: true, providerId: true, nickname: true, phone: true } } },
  });
  const benefits = await db.benefit.findMany({
    where: { isActive: true, approval: 'ACTIVE', merchant: { status: 'ACTIVE' } },
    select: { id: true, companionLimit: true, merchantId: true, merchant: { select: { avgSpendPerPerson: true } } },
  });
  const surf = merchants.find((m) => m.name === '서프홀릭 송정본점');
  const benefitsOf = (preferSurf: boolean) => (preferSurf && surf ? benefits.filter((b) => b.merchantId === surf.id) : benefits);
  const drops = await db.drop.findMany({ where: { status: { in: ['OPEN', 'CLOSED', 'SOLD_OUT'] } }, select: { id: true, merchantId: true, normalPrice: true, dropPrice: true, personsPerUnit: true } });

  const today = sod(now);
  const tokenOf = new Map<string, string>();
  const tokenFor = async (p: Person, since: Date) => {
    const k = p.providerId;
    if (!tokenOf.has(k)) {
      // 가입은 첫 구매·사용보다 먼저여야 한다
      const natural = signupAt(p, now);
      const u = await ensureUser(c, p, natural.getTime() > since.getTime() ? since : natural);
      if (u) tokenOf.set(k, u.token);
    }
    return tokenOf.get(k) ?? null;
  };

  // 지난달 1일부터 채운다 — 본사 대시보드의 '지난달 같은 기간' 비교가 비지 않게 (적어도 14일, 많아야 70일)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const backDays = Math.min(70, Math.max(13, Math.round((today.getTime() - prevMonthStart.getTime()) / DAY)));
  for (let back = backDays; back >= 0; back--) {
    const day = addDays(today, -back);
    const key = dayKey(day);
    const r = rng(`live-${key}`);
    const end = back === 0 ? now : addDays(day, 1);
    const fraction = back === 0 ? Math.min(1, Math.max(0.3, (now.getHours() + now.getMinutes() / 60 - 9) / 12)) : 1;
    const want = dayTargets(day, r, fraction);
    const have = await countsOfDay(db, day, end);

    // ── 가입 ──
    for (let i = have.signups; i < want.signups; i++) {
      const t = timeInDay(day, r, now, 9, 23);
      if (!t) continue;
      const p = { providerId: `demo-live-d${key.replace(/-/g, '')}-${i + 1}`, nickname: `${pick(r, NICKS)}${int(r, 10, 99)}`, phone: phoneOf(int(r, 100, 900) + i) };
      const token = await login(p.providerId, p.nickname);
      const u = token ? await db.user.findFirst({ where: { provider: 'KAKAO', providerId: p.providerId }, select: { id: true } }) : null;
      if (u) { await backdateUserRow(db, u.id, t, p.phone); tot.signups++; }
    }

    // ── 잼 구매 ──
    for (let i = have.jams; i < want.jams; i++) {
      const t = timeInDay(day, r, now);
      if (!t) continue;
      const code = weighted<JamCode>(r, [['JAM3', 4], ['JAM5', 3], ['CAFEJAM', 2], ['JAMMASTER', 1]]);
      const p = { providerId: `demo-live-j${key.replace(/-/g, '')}-${i + 1}`, nickname: `${pick(r, NICKS)}${int(r, 10, 99)}`, phone: phoneOf(int(r, 100, 900) + 50 + i) };
      const startDay = code === 'JAMMASTER' ? t : sod(t);
      if (await buyJamAt(c, p, code, t, startDay)) tot.jams++;
    }

    // ── 이용권 구매 + 현장 사용 ──
    const nowCounts = await countsOfDay(db, day, end);
    const needOrders = Math.max(0, want.orders - nowCounts.orders);
    const needUses = Math.max(0, want.uses - nowCounts.uses);
    const pairs = tickets.length ? Math.min(needOrders, needUses) : 0;
    const plan: ('pair' | 'buy' | 'coupon')[] = [];
    for (let i = 0; i < pairs; i++) plan.push('pair');
    if (tickets.length) for (let i = pairs; i < needOrders; i++) plan.push('buy');
    // 잼마스터 회원이 아직 없던 날에는 쿠폰 사용은 만들지 않는다 (이용권 사용만)
    const anyMaster = masters.some((m) => m.startAt.getTime() < end.getTime() - HOUR && m.endAt.getTime() > day.getTime());
    if (anyMaster) for (let i = pairs; i < needUses; i++) plan.push('coupon');

    // 이용권을 산다(앱과 같은 경로) → 산 시각으로 맞추고, 쓴 것이면 쓴 시각으로 맞춘다
    const sellTicket = async (prod: (typeof products)[number], t1: Date, useAfter: boolean): Promise<boolean> => {
      const buyer = livePerson(int(r, 29, LIVE_COUNT));
      const token = await tokenFor(buyer, addDays(day, -2));
      if (!token) return miss('구매자 가입 실패');
      const since = new Date(Date.now() - 3_000);
      let res = await http(`/products/${prod.id}/purchase`, { token, body: { headcount: 1, contactName: buyer.nickname, contactPhone: buyer.phone, agreed: true } });
      // 주문번호가 우연히 겹쳐 서버가 500을 주는 일이 아주 드물게 있다 — 한 번 더 시도한다
      if (res.status >= 500) res = await http(`/products/${prod.id}/purchase`, { token, body: { headcount: 1, contactName: buyer.nickname, contactPhone: buyer.phone, agreed: true } });
      if (!res.ok) return miss(`구매 ${res.status} ${String(res.json?.message ?? '').slice(0, 40)}`);
      const uRow = await db.user.findFirst({ where: { provider: 'KAKAO', providerId: buyer.providerId }, select: { id: true } });
      if (!uRow) return miss('구매자를 못 찾음');
      const v = await db.voucher.findFirst({ where: { userId: uRow.id, productId: prod.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
      if (!v) return miss('산 이용권을 못 찾음');
      tot.orders++;
      let t2: Date | null = null;
      if (useAfter) {
        const cand = new Date(t1.getTime() + between(r, 0.5, 5) * HOUR);
        t2 = cand.getTime() < now.getTime() - 10 * 60_000 ? cand : null;
      }
      const pin = pinOf.get(prod.merchantId);
      if (t2 && pin) {
        const sinceUse = new Date(Date.now() - 2_000);
        const used = await http('/redeem', { token, body: { itemType: 'VOUCHER', itemId: v.id, merchantId: prod.merchantId, pin, headcount: 1 } });
        if (used.ok) {
          tot.uses++;
          // 사용 처리가 만든 기록(쓴 이용권·열린 쿠폰·사용 기록)은 쓴 시각으로
          await backdateUser(db, uRow.id, sinceUse, Date.now() - t2.getTime());
          // 구매·결제는 산 시각으로
          await db.order.updateMany({ where: { userId: uRow.id, createdAt: { gte: since, lt: sinceUse } }, data: { createdAt: t1, paidAt: t1, agreedAt: t1 } });
          await db.payment.updateMany({ where: { order: { userId: uRow.id }, createdAt: { gte: since, lt: sinceUse } }, data: { createdAt: t1, paidAt: t1 } });
          await db.voucher.update({ where: { id: v.id }, data: { createdAt: t1, validFrom: t1, validTo: new Date(t1.getTime() + 90 * DAY), usedAt: t2 } });
          return true;
        }
      }
      await backdateUser(db, uRow.id, since, Date.now() - t1.getTime(), { keepValidity: true });
      await db.voucher.update({ where: { id: v.id }, data: { validTo: new Date(t1.getTime() + 90 * DAY) } });
      return true;
    };

    // 잼마스터 회원이 쿠폰을 쓴다
    const useCoupon = async (t1: Date, preferSurf: boolean): Promise<boolean> => {
      const eligible = masters.filter((m) => m.startAt.getTime() < t1.getTime() - HOUR && m.endAt.getTime() > t1.getTime());
      if (!eligible.length) return miss('그 시각에 쓸 수 있는 잼 회원 없음');
      const m = pick(r, eligible);
      const pool = benefitsOf(preferSurf);
      if (!pool.length) return false;
      const bf = pick(r, pool);
      const maxHead = bf.companionLimit != null ? bf.companionLimit + 1 : 4;
      const headcount = Math.min(maxHead, weighted(r, [[1, 3], [2, 5], [3, 2], [4, 1]]));
      const avg = bf.merchant.avgSpendPerPerson ?? 15000;
      const billAmount = Math.round((avg * headcount * between(r, 0.8, 1.5)) / 1000) * 1000;
      const token = await tokenFor({ providerId: m.user.providerId, nickname: m.user.nickname, phone: m.user.phone ?? phoneOf(1) }, addDays(day, -30));
      if (!token) return miss('쿠폰 사용자 로그인 실패');
      const sinceUse = new Date(Date.now() - 2_000);
      const used = await http('/redeem', { token, body: { itemType: 'BENEFIT', itemId: bf.id, merchantId: bf.merchantId, headcount, billAmount } });
      if (!used.ok) return miss(`쿠폰 사용 ${used.status} ${String(used.json?.message ?? '').slice(0, 40)}`);
      tot.uses++;
      await backdateUser(db, m.user.id, sinceUse, Date.now() - t1.getTime(), { keepValidity: true });
      return true;
    };

    for (const step of plan) {
      const t1 = timeInDay(day, r, now);
      if (!t1) continue;
      if (step === 'coupon') { await useCoupon(t1, r() < 0.3); continue; }
      const [prod] = weighted(r, tickets.map((t) => [t, t[1]] as [typeof t, number]));
      await sellTicket(prod, t1, step === 'pair');
    }

    // ── 서프홀릭 송정본점(점주 시연 계정)은 날마다 판매 3~4건·사용 3~4건이 있게 ──
    if (surf) {
      const surfPass = products.find((p) => p.merchantId === surf.id);
      const surfWant = Math.round((day.getDay() === 0 || day.getDay() === 6 ? 4 : 3) * Math.max(fraction, back === 0 ? 0 : 1));
      if (surfWant > 0) {
        const surfSales =
          (await db.voucher.count({ where: { createdAt: { gte: day, lt: end }, reservation: null, product: { merchantId: surf.id }, status: { not: 'CANCELLED' } } })) +
          (await db.reservation.count({ where: { createdAt: { gte: day, lt: end }, product: { merchantId: surf.id }, status: { not: 'CANCELLED' } } }));
        for (let i = surfSales; i < surfWant && surfPass; i++) {
          const t1 = timeInDay(day, r, now);
          if (t1) await sellTicket(surfPass, t1, r() < 0.6);
        }
        const surfUses = await db.redemption.count({ where: { merchantId: surf.id, status: 'DONE', createdAt: { gte: day, lt: end } } });
        for (let i = surfUses; anyMaster && i < surfWant; i++) {
          const t1 = timeInDay(day, r, now);
          if (t1) await useCoupon(t1, true);
        }
      }
    }

    // ── 딜(DROP) 사용 — 직접 기록 ──
    const dropWant = day.getDay() === 0 || day.getDay() === 6 ? 2 : 1;
    const dropHave = await db.redemption.count({ where: { type: 'DROP', createdAt: { gte: day, lt: end } } });
    for (let i = dropHave; i < dropWant && drops.length; i++) {
      const t = timeInDay(day, r, now, 17, 21);
      if (!t) continue;
      const d = pick(r, drops);
      const holder = livePerson(int(r, 29, LIVE_COUNT));
      const u = await ensureUser(c, holder, signupAt(holder, now));
      if (!u) continue;
      const claimAt = new Date(t.getTime() - between(r, 0.3, 3) * HOUR);
      const claim = await db.dropClaim.create({ data: { dropId: d.id, userId: u.id, status: 'USED', qty: 1, validTo: addDays(claimAt, 1), claimedAt: claimAt, usedAt: t } });
      await db.redemption.create({
        data: {
          userId: u.id, merchantId: d.merchantId, type: 'DROP', dropClaimId: claim.id, headcount: d.personsPerUnit, savedAmount: Math.max(0, d.normalPrice - d.dropPrice),
          verifyToken: `demo-${key}-${i}-${Math.floor(r() * 1e9)}`, verifyExpires: new Date(t.getTime() + 90_000), createdAt: t,
        },
      });
      tot.drops++;
    }

    // ── 잼 화면 조회 — 안 사고 본 사람들 ──
    const wantViews = Math.round(between(r, 9, 18) * (back === 0 ? fraction : 1)) + (have.jams + 1) * 2;
    if (have.views < wantViews) {
      const rows: { anonId: string; event: string; entityType: string; entityId: string; createdAt: Date }[] = [];
      for (let i = have.views; i < wantViews; i++) {
        const t = timeInDay(day, r, now, 9, 23);
        if (!t) continue;
        rows.push({ anonId: `demo-anon-${key}-${i}`, event: 'plan_view', entityType: 'plan', entityId: weighted(r, [['JAM3', 4], ['JAM5', 3], ['CAFEJAM', 2], ['JAMMASTER', 3], ['DANANG', 2]] as [JamCode, number][]), createdAt: t });
      }
      if (rows.length) { await db.eventLog.createMany({ data: rows }); tot.views += rows.length; }
    }
  }
  return tot;
}

/** 만든 손님의 가입 시각이 첫 구매·사용보다 늦으면, 그보다 먼저로 당긴다 (시연용으로 만든 손님만) */
async function fixSignups(c: Ctx) {
  return c.db.$executeRawUnsafe(`
    UPDATE "User" u SET "createdAt" = f.first_at - interval '40 minutes'
    FROM (
      SELECT "userId", MIN(at) AS first_at FROM (
        SELECT "userId", "createdAt" AS at FROM "Order"
        UNION ALL SELECT "userId", "createdAt" FROM "UserMembership"
        UNION ALL SELECT "userId", "createdAt" FROM "Reservation"
        UNION ALL SELECT "userId", "createdAt" FROM "Redemption"
        UNION ALL SELECT "userId", "claimedAt" FROM "DropClaim"
      ) t GROUP BY "userId"
    ) f
    WHERE f."userId" = u.id AND u."providerId" LIKE 'demo-live-%' AND u."createdAt" > f.first_at - interval '10 minutes'`);
}

// ───────────── ④ 정산 · 감사 로그 ─────────────
async function fillSettlements(c: Ctx) {
  const { db, now } = c;
  const policy = await getSettlementPolicy(db as never);
  const periods = endedPeriods(policy, now, 5).reverse(); // 오래된 것부터
  let created = 0;
  for (const [i, p] of periods.entries()) {
    const r = await saveSettlements(db as never, p, { onlyMissing: true });
    created += r.created;
    // 오래된 정산은 지급 완료·확정으로, 가장 최근 것은 '정산 예정'으로 둔다. 보류한 건은 그대로 둔다
    const age = periods.length - 1 - i;
    const open = { periodEnd: p.end, status: 'PENDING' as const, heldAt: null };
    if (age >= 2) {
      await db.settlement.updateMany({ where: open, data: { status: 'PAID', confirmedAt: addDays(p.end, -1), paidAt: p.end, memo: `${p.end.getMonth() + 1}월 ${p.end.getDate()}일 정산` } });
    } else if (age === 1) {
      await db.settlement.updateMany({ where: open, data: { status: 'CONFIRMED', confirmedAt: addDays(p.end, -1) } });
    }
  }
  return created;
}

async function fillAudit(c: Ctx) {
  const { db, now } = c;
  const admin = await db.adminUser.findFirst({ select: { id: true } });
  if (!admin) return 0;
  const since = addDays(sod(now), -9);
  const have = await db.auditLog.count({ where: { createdAt: { gte: since } } });
  if (have >= 14) return 0;
  const prods = await db.product.findMany({ where: { isActive: true }, select: { id: true, name: true, merchant: { select: { name: true } } }, take: 10 });
  const bens = await db.benefit.findMany({ where: { isActive: true }, select: { id: true, title: true, merchant: { select: { name: true } } }, take: 10 });
  const mers = await db.merchant.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, take: 10 });
  const dropRows = await db.drop.findMany({ select: { id: true, title: true }, take: 10 });
  const camps = await db.campaign.findMany({ select: { id: true, title: true }, take: 3 });
  const r = rng(`audit-${dayKey(now)}`);
  const rows: { adminUserId: string; action: string; targetType: string; targetId: string; memo: string; createdAt: Date }[] = [];
  for (let back = 9; back >= 0; back--) {
    const day = addDays(sod(now), -back);
    const n = back === 0 ? 1 : int(r, 1, 3);
    for (let i = 0; i < n; i++) {
      const t = timeInDay(day, r, now, 9, 19);
      if (!t) continue;
      const kind = int(r, 0, 7);
      if (kind === 0 && prods.length) { const p = pick(r, prods); rows.push({ adminUserId: admin.id, action: 'PRODUCT_UPDATE', targetType: 'Product', targetId: p.id, memo: `${p.merchant.name} / ${p.name} · 수량·기간 조정`, createdAt: t }); }
      else if (kind === 1 && bens.length) { const b = pick(r, bens); rows.push({ adminUserId: admin.id, action: 'BENEFIT_APPROVE', targetType: 'Benefit', targetId: b.id, memo: `${b.merchant.name} / ${b.title}`, createdAt: t }); }
      else if (kind === 2 && dropRows.length) { const d = pick(r, dropRows); rows.push({ adminUserId: admin.id, action: 'DROP_APPROVE', targetType: 'Drop', targetId: d.id, memo: d.title, createdAt: t }); }
      else if (kind === 3 && mers.length) { const m = pick(r, mers); rows.push({ adminUserId: admin.id, action: 'MERCHANT_UPDATE', targetType: 'Merchant', targetId: m.id, memo: `${m.name} · 1인 평균 이용금액 수정`, createdAt: t }); }
      else if (kind === 4 && camps.length) { const cp = pick(r, camps); rows.push({ adminUserId: admin.id, action: 'CAMPAIGN_UPDATE', targetType: 'Campaign', targetId: cp.id, memo: `${cp.title} · 기간 연장`, createdAt: t }); }
      else if (kind === 5 && prods.length) { const p = pick(r, prods); rows.push({ adminUserId: admin.id, action: 'SLOT_CREATE', targetType: 'Product', targetId: p.id, memo: `${p.name} · 예약 시간대 추가`, createdAt: t }); }
      else if (kind === 6) { rows.push({ adminUserId: admin.id, action: 'SETTLEMENT_GENERATE', targetType: 'Settlement', targetId: `${dayKey(day)}`, memo: '다시 계산', createdAt: t }); }
      else if (bens.length) { const b = pick(r, bens); rows.push({ adminUserId: admin.id, action: 'BENEFIT_UPDATE', targetType: 'Benefit', targetId: b.id, memo: `${b.merchant.name} / ${b.title} · 조건 메모 수정`, createdAt: t }); }
    }
  }
  if (rows.length) await db.auditLog.createMany({ data: rows });
  return rows.length;
}

// ───────────── 시연 손님(부산또갈래)의 앞날 ─────────────
/** 가까운 날들의 예약을 몇 건 넣고, 날짜 있는 티켓 이용권을 하나 들고 있게 한다 */
async function fillDemoUserFuture(c: Ctx) {
  const { db, now, until } = c;
  if (!c.alive) return { booked: 0, ticket: false };
  const user = await db.user.findFirst({ where: { providerId: 'demo-user-1' }, select: { id: true, nickname: true } });
  if (!user) return { booked: 0, ticket: false };
  const token = await login('demo-user-1', user.nickname);
  if (!token) return { booked: 0, ticket: false };
  const r = rng(`demo-user-${dayKey(now)}`);
  let booked = 0;

  const upcoming = await db.reservation.findMany({ where: { userId: user.id, status: 'CONFIRMED', slot: { startAt: { gt: now } } }, select: { slot: { select: { startAt: true } } } });
  const haveDays = new Set(upcoming.map((u) => dayKey(u.slot.startAt)));
  const wantDays = [0, 2, 5, 9, 15, 23].map((n) => addDays(sod(now), n)).filter((d) => d.getTime() < until.getTime());
  for (const d of wantDays) {
    if (upcoming.length + booked >= 6) break;
    if (haveDays.has(dayKey(d))) continue;
    const slot = await db.productSlot.findFirst({
      where: {
        isOpen: true,
        startAt: { gt: new Date(now.getTime() + 2 * HOUR), gte: d, lt: addDays(d, 1) },
        product: { isActive: true, type: 'RESERVATION', name: { contains: pick(r, ['요트', '서핑', '요트', 'SUP']) } },
      },
      orderBy: { startAt: 'desc' }, select: { id: true, productId: true, capacity: true, reserved: true },
    });
    if (!slot || slot.reserved + 2 > slot.capacity) continue;
    const since = new Date(Date.now() - 3_000);
    const res = await http(`/products/${slot.productId}/purchase`, { token, body: { slotId: slot.id, headcount: 2, contactName: '김지우', contactPhone: '010-2468-1357', agreed: true } });
    if (!res.ok) continue;
    booked++;
    if (d.getTime() > sod(now).getTime()) {
      const bookedAt = atTime(addDays(sod(now), -int(r, 1, 6)), int(r, 9, 21), int(r, 0, 59));
      await backdateUser(db, user.id, since, Date.now() - bookedAt.getTime(), { keepValidity: true });
    }
  }

  // 날짜 있는 티켓 — 이용일 전 이용권을 하나 들고 있게 (내 구매에 "이용일 전" 표시)
  let ticket = false;
  const dated = await db.product.findFirst({ where: { name: '크리스마스 이브 야경 선상 크루즈', isActive: true } });
  if (dated) {
    const mine = await db.voucher.count({ where: { userId: user.id, productId: dated.id, status: { not: 'CANCELLED' } } });
    if (mine === 0) {
      const since = new Date(Date.now() - 3_000);
      const res = await http(`/products/${dated.id}/purchase`, { token, body: { headcount: 1, contactName: '김지우', contactPhone: '010-2468-1357', agreed: true } });
      if (res.ok) {
        ticket = true;
        const at = atTime(addDays(sod(now), -2), 21, 14);
        await backdateUser(db, user.id, since, Date.now() - at.getTime(), { keepValidity: true });
      }
    }
  }
  return { booked, ticket };
}

// ───────────── 한 번에 ─────────────
export async function demoLive(db: PrismaClient, now: Date) {
  const alive = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
  const c: Ctx = { db, now, until: DEMO_UNTIL, alive };
  const log: string[] = [];
  const step = async <T,>(label: string, f: () => Promise<T>, show: (x: T) => string) => {
    try { log.push(`${label} ${show(await f())}`); } catch (e: any) { log.push(`${label} 실패(${String(e?.message ?? e).slice(0, 80)})`); }
  };
  await step('기간', () => extendWindows(c), (x) => `[${x}]`);
  await step('광고', () => ensureAds(c), (n) => `${n}자리`);
  if (alive) {
    await step('잼 회원', () => ensureMembers(c), (n) => `${n}명 추가`);
    await step('앞으로 예약', () => fillFutureReservations(c), (x) => `${x.created}건 추가`);
    await step('최근 활동', () => fillLiveActivity(c), (t) => `가입 ${t.signups} · 잼 ${t.jams} · 이용권 구매 ${t.orders} · 사용 ${t.uses} · 딜 ${t.drops} · 잼 조회 ${t.views}${Object.keys(t.fails).length ? ' · 못 한 것 [' + Object.entries(t.fails).map(([k, n]) => `${k} ${n}`).join(', ') + ']' : ''}`);
    await step('시연 손님', () => fillDemoUserFuture(c), (x) => `예약 ${x.booked}건${x.ticket ? ' · 날짜 티켓' : ''}`);
  } else {
    log.push('API가 꺼져 있어 예약·구매·사용 채우기는 건너뜀');
  }
  await step('가입 시각 바로잡기', () => fixSignups(c), (n) => `${n}명`);
  await step('정산', () => fillSettlements(c), (n) => `${n}건 만듦`);
  await step('감사 로그', () => fillAudit(c), (n) => `${n}건`);
  return log.join(' · ');
}

// 단독 실행: npx tsx scripts/demo-live.ts
if (process.argv[1] && /demo-live\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  (async () => {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient();
    try { console.log(await demoLive(db, new Date())); } finally { await db.$disconnect(); }
  })();
}
