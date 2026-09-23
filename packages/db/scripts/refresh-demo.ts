/**
 * 시연 데이터 날짜 되살리기.
 *
 * 시드는 '시드한 날' 기준으로 날짜를 만든다. 며칠 지나면 DROP은 전부 마감되고,
 * 기획전은 끝나고, 예약 상품은 남은 시간대가 없어 결제할 수 없게 된다.
 * 시연 직전에 이걸 돌리면 지금 기준으로 다시 열린다. 몇 번을 돌려도 된다.
 *
 * 실행: npm run demo:refresh -w @holicgem/db
 * 실서비스 DB에는 돌리지 않는다.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * 다시 열 DROP과 남길 시간(시간 단위).
 * 몇 시간짜리와 며칠짜리를 섞어야 '곧 마감'과 '여유 있음'이 함께 보인다.
 * 테스트용·승인대기 DROP은 넣지 않는다.
 */
const DROPS: [string, number][] = [
  ['요트 선셋 티켓 막판 4석', 3],
  ['화덕 마르게리타 1+1', 4],
  ['야경 크루즈 오늘 밤 특가', 5],
  ['뮤지엄원 야간권 반값', 6],
  ['갓 구운 에그타르트 4개 세트', 8],
  ['핸드드립+티라미수 브레이크 세트', 26],
  ['[멤버 전용] 시그니처 칵테일 1+1', 30],
  ['비치런+서핑+아이스바스 리커버리 체험', 50],
  ['키마위크 선셋 요트 크루즈 특별권', 74],
  ['수변영화관 나이트 시네마 입장권', 122],
];

/** 예약 상품의 시간대를 며칠 앞까지 채울지 */
const SLOT_DAYS = 14;

/**
 * 예약 상품 시간표 — 시드가 만든 시간대는 '시드한 시각 + N시간'이라 17:38 같은 어중간한 시각이 된다.
 * 상품 성격에 맞는 시각을 여기서 정한다. [시각, 길이(분)], 정원, 주말만 여는지.
 * 목록에 없는 예약 상품은 10:00·14:00, 2시간, 10명.
 */
const SCHEDULES: Record<string, { times: [string, number][]; capacity: number; weekendOnly?: boolean }> = {
  '송정 입문 서핑 강습 (2시간)': { times: [['10:00', 120], ['13:00', 120], ['15:30', 120]], capacity: 8 },
  '광안리 선셋 요트투어 (60분)': { times: [['16:30', 60], ['18:00', 60], ['19:30', 60]], capacity: 12 },
  '광안리 나이트 SUP (90분)': { times: [['19:00', 90], ['20:30', 90]], capacity: 10 },
  '주말 브런치 코스 (2인)': { times: [['10:30', 120], ['12:30', 120]], capacity: 6, weekendOnly: true },
  '핸드드립 원데이 클래스': { times: [['11:00', 120], ['15:00', 120]], capacity: 6 },
};
const DEFAULT_SCHEDULE = { times: [['10:00', 120], ['14:00', 120]] as [string, number][], capacity: 10 };

async function refreshDrops(now: Date) {
  let n = 0;
  for (const [title, hours] of DROPS) {
    const openAt = new Date(now.getTime() - 2 * HOUR);
    const r = await db.drop.updateMany({
      where: { title },
      data: {
        status: 'OPEN',
        openAt,
        closeAt: new Date(now.getTime() + hours * HOUR),
        memberPreOpenAt: null,
      },
    });
    n += r.count;
  }
  return n;
}

/**
 * 승인 대기 DROP — 상태는 그대로 두고 판매 기간만 앞으로 민다.
 * 본사가 승인했을 때 손님 앱에 떠야 승인 흐름을 보여줄 수 있다. 기간이 지난 채로
 * 승인하면 승인만 되고 앱에는 나타나지 않는다(2026-09-20).
 */
async function refreshPending(now: Date) {
  const r = await db.drop.updateMany({
    where: { status: 'PENDING' },
    data: {
      openAt: new Date(now.getTime() - HOUR),
      closeAt: new Date(now.getTime() + 3 * DAY),
    },
  });
  return r.count;
}

async function refreshCampaigns(now: Date) {
  // 끝났거나 곧 끝날 기획전은 열흘 뒤로 민다
  const rows = await db.campaign.findMany({
    where: { isActive: true, endAt: { lt: new Date(now.getTime() + 2 * DAY) } },
    select: { id: true },
  });
  for (const c of rows) {
    await db.campaign.update({
      where: { id: c.id },
      data: { startAt: new Date(now.getTime() - 3 * DAY), endAt: new Date(now.getTime() + 10 * DAY) },
    });
  }
  return rows.length;
}

/**
 * 예약 상품 시간대 — 앞으로의 빈 시간대를 지우고 시간표대로 SLOT_DAYS일치를 다시 채운다.
 * 이미 예약이 들어간 시간대는 지우지 않는다(손님 예약이 사라지면 안 된다).
 */
async function refreshSlots(now: Date) {
  const products = await db.product.findMany({
    where: { isActive: true, type: 'RESERVATION' },
    select: { id: true, name: true },
  });
  let created = 0;
  for (const p of products) {
    await db.productSlot.deleteMany({
      where: { productId: p.id, startAt: { gt: now }, reserved: 0, reservations: { none: {} } },
    });
    const kept = await db.productSlot.findMany({
      where: { productId: p.id, startAt: { gt: now } },
      select: { startAt: true },
    });
    const taken = new Set(kept.map((s) => s.startAt.getTime()));

    const plan = SCHEDULES[p.name] ?? DEFAULT_SCHEDULE;
    for (let d = 0; d < SLOT_DAYS; d++) {
      const day = new Date(now);
      day.setDate(day.getDate() + d);
      const dow = day.getDay();
      if ('weekendOnly' in plan && plan.weekendOnly && dow !== 0 && dow !== 6) continue;
      for (const [hm, minutes] of plan.times) {
        const [h, m] = hm.split(':').map(Number);
        const startAt = new Date(day);
        startAt.setHours(h, m, 0, 0);
        if (startAt.getTime() <= now.getTime() + HOUR) continue; // 곧 시작하거나 지난 시간은 팔지 않는다
        if (taken.has(startAt.getTime())) continue;
        await db.productSlot.create({
          data: {
            productId: p.id,
            startAt,
            endAt: new Date(startAt.getTime() + minutes * 60_000),
            capacity: plan.capacity,
          },
        });
        created++;
      }
    }
  }
  return { products: products.length, created };
}

/**
 * 앞으로의 예약 채우기 — 점주 달력이 비어 보이지 않게 한다.
 *
 * 예약·결제는 앱과 똑같은 경로(API)로 만든다. 여기서 직접 행을 넣으면 주문·결제·이용권이
 * 빠져서 점주 달력의 '자세히'에 결제 정보가 안 뜬다. API가 꺼져 있으면 조용히 건너뛴다.
 */
const API = process.env.API_URL || 'http://localhost:4000';

/** 시연용 손님 — 실제 예약자처럼 보이는 이름과 연락처 */
const GUESTS: [string, string][] = [
  ['김민서', '010-2431-8870'],
  ['박도윤', '010-3372-1154'],
  ['이서아', '010-8845-2207'],
  ['최지호', '010-5519-6642'],
  ['정하윤', '010-2277-9031'],
  ['한수빈', '010-6604-3318'],
  ['오재현', '010-9912-4457'],
  ['임규원', '010-3048-7762'],
];

/** 앞으로 며칠치 예약을 채울지 · 몇 건까지 채울지 */
const RESV_DAYS = 10;
const RESV_TARGET = 14;

async function guestToken(name: string, i: number): Promise<string | null> {
  try {
    const r = await fetch(`${API}/auth/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'KAKAO', providerId: `demo-guest-${i + 1}`, nickname: name }),
    });
    const j: any = await r.json();
    return j.token ?? null;
  } catch {
    return null;
  }
}

async function refreshReservations(now: Date) {
  const alive = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
  if (!alive) return { skipped: true, created: 0 };

  // 앞으로의 예약이 이미 넉넉하면 그대로 둔다 — 몇 번을 돌려도 쌓이지 않게
  const have = await db.reservation.count({
    where: { status: 'CONFIRMED', slot: { startAt: { gt: now } } },
  });
  if (have >= RESV_TARGET) return { skipped: false, created: 0 };

  const until = new Date(now.getTime() + RESV_DAYS * DAY);
  const slots = await db.productSlot.findMany({
    where: {
      isOpen: true,
      startAt: { gt: new Date(now.getTime() + HOUR), lte: until },
      product: { isActive: true, type: 'RESERVATION' },
    },
    orderBy: { startAt: 'asc' },
    select: { id: true, productId: true, capacity: true, reserved: true, startAt: true },
  });
  if (slots.length === 0) return { skipped: false, created: 0 };

  // 상품이 골고루 섞이도록 회차를 상품별로 돌아가며 고른다
  const byProduct: Record<string, typeof slots> = {};
  for (const s of slots) (byProduct[s.productId] ||= []).push(s);
  const queues = Object.values(byProduct);
  const picked: typeof slots = [];
  for (let round = 0; picked.length < RESV_TARGET - have; round++) {
    let added = false;
    for (const q of queues) {
      const s = q[round];
      if (!s) continue;
      if (s.reserved + 2 > s.capacity) continue;
      picked.push(s);
      added = true;
      if (picked.length >= RESV_TARGET - have) break;
    }
    if (!added) break;
  }

  let created = 0;
  for (let i = 0; i < picked.length; i++) {
    const [name, phone] = GUESTS[i % GUESTS.length];
    const token = await guestToken(name, i % GUESTS.length);
    if (!token) continue;
    const headcount = (i % 3) + 1;
    try {
      const r = await fetch(`${API}/products/${picked[i].productId}/purchase`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ slotId: picked[i].id, headcount, contactName: name, contactPhone: phone }),
      });
      if (r.ok) created++;
    } catch {
      /* 한 건 실패해도 나머지는 계속 만든다 */
    }
  }
  return { skipped: false, created };
}

/**
 * 오늘 팔린 티켓 몇 건 — 점주 대시보드의 '최근 판매(48시간)'가 비지 않게 한다.
 * 티켓은 오는 날이 정해져 있지 않아 달력에는 안 들어가고, 판매 알림으로만 보인다.
 */
async function refreshTicketSales(now: Date) {
  const alive = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
  if (!alive) return { skipped: true, created: 0 };

  const since = new Date(now.getTime() - 2 * DAY);
  const have = await db.voucher.count({ where: { createdAt: { gte: since }, reservation: null } });
  if (have >= 4) return { skipped: false, created: 0 };

  const products = await db.product.findMany({
    where: { isActive: true, type: 'TICKET' },
    select: { id: true },
    take: 4,
  });

  let created = 0;
  for (let i = 0; i < products.length; i++) {
    const [name] = GUESTS[(i + 3) % GUESTS.length];
    const token = await guestToken(name, (i + 3) % GUESTS.length);
    if (!token) continue;
    try {
      const r = await fetch(`${API}/products/${products[i].id}/purchase`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ headcount: 1 }),
      });
      if (r.ok) created++;
    } catch {
      /* 무시 */
    }
  }
  return { skipped: false, created };
}

async function main() {
  const now = new Date();
  const drops = await refreshDrops(now);
  const pending = await refreshPending(now);
  const campaigns = await refreshCampaigns(now);
  const slots = await refreshSlots(now);
  // 시간대를 채운 다음에 예약을 넣어야 앞으로의 회차에 손님이 들어간다
  const resv = await refreshReservations(now);
  const tickets = await refreshTicketSales(now);
  console.log(`DROP ${drops}개 다시 열림 · 승인 대기 ${pending}개 기간 연장 · 기획전 ${campaigns}개 연장 · 예약 상품 ${slots.products}개에 시간대 ${slots.created}개 추가`);
  console.log(
    resv.skipped
      ? 'API가 꺼져 있어 예약·판매는 건너뜀 (API를 켜고 다시 돌리면 채워짐)'
      : `앞으로의 예약 ${resv.created}건 · 오늘 티켓 판매 ${tickets.created}건 추가`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
