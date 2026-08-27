/**
 * 개발/데모용 시드 데이터.
 * 실제 홀릭잼 공식 혜택표(2026-08 기준 공개자료)의 가맹점·혜택을 기반으로 구성했다.
 * DROP은 시드 실행 시각 기준으로 "오늘 열려 있는" 상태가 되도록 상대 시간으로 만든다.
 */
import { PrismaClient, BenefitType, GrantTrigger, ProductType, VerificationLevel, DropKind, DropStatus, DropAudience } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const now = () => new Date();
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400_000);
const qr = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;

async function main() {
  console.log('[seed] start');

  // ---------- 지역 ----------
  const regions = await Promise.all(
    [
      { code: 'busan-haeundae', city: '부산광역시', district: '해운대구', name: '해운대', isOpen: true, sortOrder: 1 },
      { code: 'busan-gwangalli', city: '부산광역시', district: '수영구', name: '광안리', isOpen: true, sortOrder: 2 },
      { code: 'busan-songjeong', city: '부산광역시', district: '해운대구', name: '송정', isOpen: true, sortOrder: 3 },
      { code: 'busan-dadaepo', city: '부산광역시', district: '사하구', name: '다대포', isOpen: true, sortOrder: 4 },
      { code: 'busan-seomyeon', city: '부산광역시', district: '부산진구', name: '서면', isOpen: true, sortOrder: 5 },
      { code: 'seoul-seongsu', city: '서울특별시', district: '성동구', name: '성수', isOpen: false, sortOrder: 10 },
    ].map((r) =>
      prisma.region.upsert({ where: { code: r.code }, update: r, create: r }),
    ),
  );
  const R = Object.fromEntries(regions.map((r) => [r.code, r]));

  // ---------- 카테고리 ----------
  const categories = await Promise.all(
    [
      { code: 'cafe', name: '카페', emoji: '☕', sortOrder: 1 },
      { code: 'food', name: '맛집', emoji: '🍽️', sortOrder: 2 },
      { code: 'bar', name: '펍·바', emoji: '🍸', sortOrder: 3 },
      { code: 'marine', name: '해양레저', emoji: '🌊', sortOrder: 4 },
      { code: 'attraction', name: '액티비티', emoji: '🎡', sortOrder: 5 },
      { code: 'exhibit', name: '전시·관람', emoji: '🎨', sortOrder: 6 },
      { code: 'class', name: '클래스', emoji: '🧑‍🍳', sortOrder: 7 },
      { code: 'kids', name: '키즈', emoji: '🧸', sortOrder: 8 },
      { code: 'stay', name: '숙박', emoji: '🏨', sortOrder: 9 },
    ].map((c) =>
      prisma.category.upsert({ where: { code: c.code }, update: c, create: c }),
    ),
  );
  const C = Object.fromEntries(categories.map((c) => [c.code, c]));

  // ---------- 멤버십 플랜 ----------
  const plans = await Promise.all(
    [
      { code: 'JAM3', name: '3일잼', description: '부산 여행 3일 동안 모든 혜택', price: 4900, durationDays: 3, sortOrder: 1 },
      { code: 'JAM5', name: '5일잼', description: '부산 여행 5일 동안 모든 혜택', price: 6900, durationDays: 5, sortOrder: 2 },
      { code: 'JAMMASTER', name: '잼마스터', description: '1년 내내 모든 혜택 + 전용 DROP 선오픈', price: 30000, durationDays: 365, sortOrder: 3 },
    ].map((p) =>
      prisma.membershipPlan.upsert({ where: { code: p.code }, update: p, create: p }),
    ),
  );
  const P = Object.fromEntries(plans.map((p) => [p.code, p]));

  // ---------- 관리자 ----------
  const adminHash = await bcrypt.hash('admin1234', 10);
  await prisma.adminUser.upsert({
    where: { email: 'admin@holicgem.com' },
    update: {},
    create: { email: 'admin@holicgem.com', passwordHash: adminHash, name: '본사 관리자', role: 'SUPER_ADMIN' },
  });

  // ---------- 데모 사용자 ----------
  const demoUser = await prisma.user.upsert({
    where: { provider_providerId: { provider: 'KAKAO', providerId: 'demo-user-1' } },
    update: {},
    create: {
      provider: 'KAKAO',
      providerId: 'demo-user-1',
      nickname: '부산또갈래',
      email: 'demo@holicgem.com',
    },
  });
  const ownerUser = await prisma.user.upsert({
    where: { provider_providerId: { provider: 'KAKAO', providerId: 'demo-owner-1' } },
    update: {},
    create: {
      provider: 'KAKAO',
      providerId: 'demo-owner-1',
      nickname: '까사부사노 사장',
      email: 'owner@holicgem.com',
    },
  });
  const surfOwner = await prisma.user.upsert({
    where: { provider_providerId: { provider: 'KAKAO', providerId: 'demo-owner-2' } },
    update: {},
    create: {
      provider: 'KAKAO',
      providerId: 'demo-owner-2',
      nickname: '서프홀릭 송정',
      email: 'surf@holicgem.com',
    },
  });

  // ---------- 가맹점 ----------
  type MSeed = {
    key: string; name: string; cat: string; region: string; intro: string;
    owner?: string; commission?: number; address?: string;
  };
  const merchantSeeds: MSeed[] = [
    { key: 'casabusano', name: '까사부사노', cat: 'cafe', region: 'busan-gwangalli', intro: '낮에는 카페, 밤에는 위스키', owner: ownerUser.id, address: '부산 수영구 광안해변로' },
    { key: 'scruffy', name: '스크러피', cat: 'cafe', region: 'busan-haeundae', intro: '내가 찾던 그 에그타르트' },
    { key: 'podo', name: 'PODO', cat: 'bar', region: 'busan-gwangalli', intro: '다양한 와인과 그로서리' },
    { key: 'basement', name: '베이스먼트', cat: 'bar', region: 'busan-seomyeon', intro: '부산 대표 스피크이지 바' },
    { key: 'dough', name: '도우개러지', cat: 'food', region: 'busan-songjeong', intro: '부산 대표 수제 피자 펍' },
    { key: 'ssummoi', name: '씀모이가든', cat: 'food', region: 'busan-haeundae', intro: '해운대 정원식 브런치' },
    { key: 'surfholic-sj', name: '서프홀릭 송정본점', cat: 'marine', region: 'busan-songjeong', intro: '전국 최초 서핑 프랜차이즈 본점', owner: surfOwner.id, commission: 10 },
    { key: 'yachtholic', name: '요트홀릭', cat: 'marine', region: 'busan-gwangalli', intro: '광안대교 아래 프라이빗 요트투어', commission: 10 },
    { key: 'rivercruise', name: '해운대리버크루즈', cat: 'marine', region: 'busan-haeundae', intro: '해운대 야경 리버크루즈', commission: 10 },
    { key: 'museum1', name: '뮤지엄원', cat: 'exhibit', region: 'busan-haeundae', intro: '미디어아트 뮤지엄' },
    { key: 'busanx', name: '부산엑스더스카이', cat: 'attraction', region: 'busan-haeundae', intro: '해운대 100층 전망대' },
    { key: 'kidsbaking', name: '리틀셰프 베이킹랩', cat: 'kids', region: 'busan-seomyeon', intro: '아이와 함께하는 원데이 베이킹' },
  ];

  const merchants: Record<string, { id: string }> = {};
  for (const m of merchantSeeds) {
    const found = await prisma.merchant.findFirst({ where: { name: m.name } });
    const data = {
      name: m.name,
      status: 'ACTIVE' as const,
      categoryId: C[m.cat].id,
      regionId: R[m.region].id,
      intro: m.intro,
      ownerUserId: m.owner ?? null,
      commissionRate: m.commission ?? 0,
      address: m.address ?? '부산광역시',
    };
    merchants[m.key] = found
      ? await prisma.merchant.update({ where: { id: found.id }, data })
      : await prisma.merchant.create({ data });
  }

  // ---------- 매장 QR ----------
  for (const [key, m] of Object.entries(merchants)) {
    const exists = await prisma.merchantQr.findFirst({ where: { merchantId: m.id, isActive: true } });
    if (!exists) {
      await prisma.merchantQr.create({
        data: { merchantId: m.id, code: qr(`HG-${key.toUpperCase()}`), label: '카운터' },
      });
    }
  }

  // ---------- 상시 혜택 + 발급 규칙 ----------
  type BSeed = {
    merchant: string; title: string; type: BenefitType; value?: number;
    freebieName?: string; companionLimit?: number | null; maxUsePerDay?: number;
    conditions?: string;
  };
  const benefitSeeds: BSeed[] = [
    { merchant: 'casabusano', title: '음료 10% · 디저트 5% 할인', type: 'PERCENT', value: 10, companionLimit: null },
    { merchant: 'scruffy', title: '결제금액 20% 할인', type: 'PERCENT', value: 20, companionLimit: null, maxUsePerDay: 1 },
    { merchant: 'podo', title: '와인 슬러시 1+1', type: 'FREEBIE', freebieName: '와인 슬러시 1잔', companionLimit: null },
    { merchant: 'basement', title: '결제금액 20% 할인', type: 'PERCENT', value: 20 },
    { merchant: 'dough', title: '오븐 스파게티 무료 제공', type: 'FREEBIE', freebieName: '오븐 스파게티', conditions: '피자 주문 시' },
    { merchant: 'ssummoi', title: '결제금액 10% 할인', type: 'PERCENT', value: 10 },
    { merchant: 'surfholic-sj', title: '서핑 강습·렌탈 10% 할인', type: 'PERCENT', value: 10, companionLimit: null },
    { merchant: 'yachtholic', title: '요트투어 30% 할인', type: 'PERCENT', value: 30, companionLimit: 3 },
    { merchant: 'rivercruise', title: '크루즈 탑승권 20% 할인', type: 'PERCENT', value: 20, companionLimit: 3 },
    { merchant: 'museum1', title: '입장권 33% 할인', type: 'PERCENT', value: 33, companionLimit: 3 },
    { merchant: 'busanx', title: '입장권 25% 할인', type: 'PERCENT', value: 25, companionLimit: 2 },
  ];

  const benefits: { id: string; merchantKey: string }[] = [];
  for (const b of benefitSeeds) {
    const found = await prisma.benefit.findFirst({
      where: { merchantId: merchants[b.merchant].id, title: b.title },
    });
    const data = {
      merchantId: merchants[b.merchant].id,
      title: b.title,
      type: b.type,
      value: b.value ?? 0,
      freebieName: b.freebieName,
      companionLimit: b.companionLimit === undefined ? null : b.companionLimit,
      maxUsePerDay: b.maxUsePerDay,
      conditions: b.conditions,
      isActive: true,
    };
    const row = found
      ? await prisma.benefit.update({ where: { id: found.id }, data })
      : await prisma.benefit.create({ data });
    benefits.push({ id: row.id, merchantKey: b.merchant });
  }

  // 모든 상시 혜택은 "어떤 멤버십이든 사면" 열린다.
  for (const b of benefits) {
    for (const planCode of ['JAM3', 'JAM5', 'JAMMASTER'] as const) {
      const exists = await prisma.benefitGrantRule.findFirst({
        where: { benefitId: b.id, trigger: 'MEMBERSHIP_PLAN', membershipPlanId: P[planCode].id },
      });
      if (!exists) {
        await prisma.benefitGrantRule.create({
          data: {
            benefitId: b.id,
            trigger: 'MEMBERSHIP_PLAN',
            membershipPlanId: P[planCode].id,
          },
        });
      }
    }
  }

  // ---------- 상품 ----------
  const productSeeds = [
    {
      key: 'surf-lesson',
      merchant: 'surfholic-sj', cat: 'marine', type: 'RESERVATION' as ProductType,
      name: '송정 입문 서핑 강습 (2시간)',
      description: '보드·슈트 렌탈 포함. 국제 서핑 자격 강사.',
      basePrice: 50000, memberPrice: 45000,
      verification: 'QR_PIN' as VerificationLevel,
      weatherDependent: true,
      cancelPolicy: '기상 악화 시 무료 변경/취소',
      slots: [
        { startH: 26, durH: 2, capacity: 10 },
        { startH: 30, durH: 2, capacity: 10 },
        { startH: 50, durH: 2, capacity: 12 },
      ],
    },
    {
      key: 'yacht-sunset',
      merchant: 'yachtholic', cat: 'marine', type: 'RESERVATION' as ProductType,
      name: '광안리 선셋 요트투어 (60분)',
      description: '광안대교 야경 코스. 음료 1잔 포함.',
      basePrice: 40000, memberPrice: 32000,
      verification: 'QR_PIN' as VerificationLevel,
      weatherDependent: true,
      cancelPolicy: '기상 악화 시 전액 환불',
      slots: [
        { startH: 28, durH: 1, capacity: 20 },
        { startH: 52, durH: 1, capacity: 20 },
      ],
    },
    {
      key: 'cruise-ticket',
      merchant: 'rivercruise', cat: 'marine', type: 'TICKET' as ProductType,
      name: '해운대 리버크루즈 탑승권',
      description: '구매 후 30일 내 사용. 현장 QR 확인.',
      basePrice: 19000, memberPrice: 15000,
      verification: 'QR_ONLY' as VerificationLevel,
      slots: [],
    },
    {
      key: 'songjeong-pass',
      merchant: 'surfholic-sj', cat: 'marine', type: 'PASS' as ProductType,
      name: '송정 바다 PASS',
      description: '서핑 체험 + 송정·해운대 로컬 혜택 자동 오픈',
      basePrice: 35000, memberPrice: null,
      verification: 'QR_PIN' as VerificationLevel,
      slots: [],
    },
  ];

  const products: Record<string, { id: string }> = {};
  for (const p of productSeeds) {
    const found = await prisma.product.findFirst({ where: { name: p.name } });
    const data = {
      merchantId: merchants[p.merchant].id,
      categoryId: C[p.cat].id,
      type: p.type,
      name: p.name,
      description: p.description,
      basePrice: p.basePrice,
      memberPrice: p.memberPrice,
      verification: p.verification,
      weatherDependent: p.weatherDependent ?? false,
      cancelPolicy: p.cancelPolicy,
      isActive: true,
    };
    const row = found
      ? await prisma.product.update({ where: { id: found.id }, data })
      : await prisma.product.create({ data });
    products[p.key] = row;

    for (const s of p.slots) {
      const startAt = hoursFromNow(s.startH);
      const exists = await prisma.productSlot.findFirst({
        where: { productId: row.id, startAt },
      });
      if (!exists) {
        await prisma.productSlot.create({
          data: {
            productId: row.id,
            startAt,
            endAt: hoursFromNow(s.startH + s.durH),
            capacity: s.capacity,
          },
        });
      }
    }
  }

  // 송정 바다 PASS를 사면 송정·해운대 로컬 혜택이 자동으로 열린다 (기존 바다 PASS 방식)
  const passBenefitKeys = ['dough', 'scruffy', 'ssummoi', 'casabusano'];
  for (const b of benefits.filter((x) => passBenefitKeys.includes(x.merchantKey))) {
    const exists = await prisma.benefitGrantRule.findFirst({
      where: { benefitId: b.id, trigger: 'PRODUCT', productId: products['songjeong-pass'].id },
    });
    if (!exists) {
      await prisma.benefitGrantRule.create({
        data: {
          benefitId: b.id,
          trigger: 'PRODUCT',
          productId: products['songjeong-pass'].id,
          validDays: 7,
        },
      });
    }
  }

  // ---------- 오늘의 DROP ----------
  const dropSeeds = [
    {
      merchant: 'yachtholic', region: 'busan-gwangalli', cat: 'marine',
      kind: 'TICKET' as DropKind, product: 'yacht-sunset',
      title: '오늘 선셋 요트 10석 한정',
      description: '오늘 일몰 타임 한정. 광안대교 야경 코스.',
      normalPrice: 40000, dropPrice: 25000, totalQty: 10,
      openAt: hoursFromNow(-2), closeAt: hoursFromNow(8),
      memberPreOpenAt: hoursFromNow(-3),
      audience: 'ALL' as DropAudience,
    },
    {
      merchant: 'ssummoi', region: 'busan-haeundae', cat: 'food',
      kind: 'DEAL' as DropKind,
      title: '평일 브런치 2인 세트 34% 할인',
      description: '14~17시 방문 한정. 현장에서 이 딜을 보여주고 할인가 결제.',
      normalPrice: 32000, dropPrice: 21000, totalQty: 20,
      openAt: hoursFromNow(-1), closeAt: hoursFromNow(10),
      usableFromMinute: 14 * 60, usableToMinute: 17 * 60,
      personsPerUnit: 2,
    },
    {
      merchant: 'surfholic-sj', region: 'busan-songjeong', cat: 'marine',
      kind: 'TICKET' as DropKind, product: 'surf-lesson',
      title: '내일 오전 서핑 체험 특가',
      description: '입문 강습 2시간. 보드·슈트 포함.',
      normalPrice: 50000, dropPrice: 35000, totalQty: 8,
      openAt: hoursFromNow(-2), closeAt: hoursFromNow(20),
    },
    {
      merchant: 'kidsbaking', region: 'busan-seomyeon', cat: 'kids',
      kind: 'DEAL' as DropKind,
      title: '키즈 베이킹 클래스 오늘 15팀',
      description: '아이 1명 + 보호자 1명. 재료 포함.',
      normalPrice: 35000, dropPrice: 19900, totalQty: 15,
      openAt: hoursFromNow(-4), closeAt: hoursFromNow(6),
      personsPerUnit: 2,
    },
    {
      merchant: 'basement', region: 'busan-seomyeon', cat: 'bar',
      kind: 'DEAL' as DropKind,
      title: '[멤버 전용] 시그니처 칵테일 1+1',
      description: '잼마스터/기간권 회원만. 오늘 밤 한정.',
      normalPrice: 18000, dropPrice: 9000, totalQty: 30,
      openAt: hoursFromNow(-1), closeAt: hoursFromNow(9),
      audience: 'MEMBER_ONLY' as DropAudience,
    },
    {
      merchant: 'museum1', region: 'busan-haeundae', cat: 'exhibit',
      kind: 'DEAL' as DropKind,
      title: '뮤지엄원 야간권 반값',
      description: '18시 이후 입장 한정.',
      normalPrice: 24000, dropPrice: 12000, totalQty: 40,
      openAt: hoursFromNow(-6), closeAt: hoursFromNow(30),
      usableFromMinute: 18 * 60, usableToMinute: 21 * 60,
      isSponsored: true,
    },
  ];

  for (const d of dropSeeds) {
    const found = await prisma.drop.findFirst({ where: { title: d.title } });
    const data = {
      merchantId: merchants[d.merchant].id,
      regionId: R[d.region].id,
      categoryId: C[d.cat].id,
      productId: d.product ? products[d.product].id : null,
      kind: d.kind,
      status: 'OPEN' as DropStatus,
      audience: d.audience ?? 'ALL',
      title: d.title,
      description: d.description,
      normalPrice: d.normalPrice,
      dropPrice: d.dropPrice,
      totalQty: d.totalQty,
      remainingQty: found?.remainingQty ?? d.totalQty,
      personsPerUnit: d.personsPerUnit ?? 1,
      openAt: d.openAt,
      closeAt: d.closeAt,
      memberPreOpenAt: d.memberPreOpenAt ?? null,
      usableFromMinute: d.usableFromMinute ?? null,
      usableToMinute: d.usableToMinute ?? null,
      isSponsored: d.isSponsored ?? false,
      approvedAt: now(),
    };
    if (found) await prisma.drop.update({ where: { id: found.id }, data });
    else await prisma.drop.create({ data });
  }

  // ---------- 승인 대기 DROP (관리자 데모용) ----------
  const pendingTitle = '[승인대기] 주말 와인 테이스팅 세트';
  const pendingFound = await prisma.drop.findFirst({ where: { title: pendingTitle } });
  if (!pendingFound) {
    await prisma.drop.create({
      data: {
        merchantId: merchants['podo'].id,
        regionId: R['busan-gwangalli'].id,
        categoryId: C['bar'].id,
        kind: 'DEAL',
        status: 'PENDING',
        title: pendingTitle,
        description: '주말 저녁 한정 와인 3종 테이스팅',
        normalPrice: 30000,
        dropPrice: 18000,
        totalQty: 12,
        remainingQty: 12,
        openAt: daysFromNow(2),
        closeAt: daysFromNow(4),
      },
    });
  }

  const counts = {
    regions: await prisma.region.count(),
    categories: await prisma.category.count(),
    plans: await prisma.membershipPlan.count(),
    merchants: await prisma.merchant.count(),
    benefits: await prisma.benefit.count(),
    grantRules: await prisma.benefitGrantRule.count(),
    products: await prisma.product.count(),
    slots: await prisma.productSlot.count(),
    drops: await prisma.drop.count(),
    users: await prisma.user.count(),
    admins: await prisma.adminUser.count(),
  };
  // ---------- 이미지 연결 (무료 스톡, UI 데모용) ----------
  const U = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=60&auto=format&fit=crop`;
  const merchantImg: Record<string, string> = {
    '까사부사노': U('1509042239860-f550ce710b93'),
    '스크러피': U('1509440159596-0249088772ff'),
    'PODO': U('1510812431401-41d2bd2722f3'),
    '베이스먼트': U('1470337458703-46ad1756a187'),
    '도우개러지': U('1513104890138-7c749659a591'),
    '씀모이가든': U('1414235077428-338989a2e8c0'),
    '서프홀릭 송정본점': U('1502680390469-be75c86b636f'),
    '요트홀릭': U('1500514966906-fe245eea9344'),
    '해운대리버크루즈': U('1477959858617-67f85cf4f1df'),
    '뮤지엄원': U('1550684848-fac1c5b4e853'),
    '부산엑스더스카이': U('1444723121867-7a241cacace9'),
    '리틀셰프 베이킹랩': U('1556909114-f6e7ad7d3136'),
  };
  for (const [name, url] of Object.entries(merchantImg)) {
    await prisma.merchant.updateMany({ where: { name }, data: { thumbnailUrl: url } });
  }
  const productImg: Record<string, string> = {
    '송정 입문 서핑 강습 (2시간)': U('1502680390469-be75c86b636f', 1200),
    '광안리 선셋 요트투어 (60분)': U('1500514966906-fe245eea9344', 1200),
    '해운대 리버크루즈 탑승권': U('1477959858617-67f85cf4f1df', 1200),
    '송정 바다 PASS': U('1507525428034-b723cf961d3e', 1200),
  };
  for (const [name, url] of Object.entries(productImg)) {
    await prisma.product.updateMany({ where: { name }, data: { imageUrl: url } });
  }
  const dropImg: Record<string, string> = {
    '오늘 선셋 요트 10석 한정': U('1500514966906-fe245eea9344', 1200),
    '평일 브런치 2인 세트 34% 할인': U('1533089860892-a7c6f0a88666', 1200),
    '내일 오전 서핑 체험 특가': U('1502680390469-be75c86b636f', 1200),
    '키즈 베이킹 클래스 오늘 15팀': U('1556909114-f6e7ad7d3136', 1200),
    '[멤버 전용] 시그니처 칵테일 1+1': U('1514362545857-3bc16c4c7d1b', 1200),
    '뮤지엄원 야간권 반값': U('1550684848-fac1c5b4e853', 1200),
    '[승인대기] 주말 와인 테이스팅 세트': U('1510812431401-41d2bd2722f3', 1200),
  };
  for (const [title, url] of Object.entries(dropImg)) {
    await prisma.drop.updateMany({ where: { title }, data: { imageUrl: url } });
  }
  console.log('[seed] images linked:', Object.keys(merchantImg).length + Object.keys(productImg).length + Object.keys(dropImg).length);

  console.log('[seed] done:', counts);
  console.log('[seed] admin login: admin@holicgem.com / admin1234');
  console.log(`[seed] demo user: KAKAO demo-user-1 (${demoUser.nickname})`);
  console.log(`[seed] merchant owner: KAKAO demo-owner-1 (${ownerUser.nickname})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
