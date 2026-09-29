/**
 * 홈 — 무료 회원과 유료 회원에게 맨 위를 다르게 보여준다 (2026-09-19 문서 4-2 대표 확정, 3-6 A).
 *  무료 회원(비로그인 포함)  ① 잼 시작하기 + 예상 절약액(상태 카드)  ② 인기 쿠폰(실제로 많이 쓰인 순)  ③ 상품 구매 혜택
 *  유료 회원                ① 오늘 사용할 혜택 — 비는 날은 인기 쿠폰  ② 만료 예정 잼  ③ 예약·구매 상품
 *  그 아래 기획전 · (비회원) 오늘의 무료 쿠폰 · DROP · 상품은 둘 다 지금처럼.
 *  맨 위 블록에 필요한 것은 /home 한 번으로 받는다 (api/src/home.ts).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { track } from '../../lib/analytics';
import { api, cacheGet, cacheSet, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LangButton, pickGreeting, useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Screen } from '../../lib/ui';
import { HScroll } from '../../lib/hscroll';
import { Logo } from '../../lib/logo';

type Tr = (key: string, vars?: Record<string, string | number>) => string;

type Drop = {
  id: string; title: string; imageUrl: string | null;
  merchant: { name: string }; region: { name: string };
  normalPrice: number; dropPrice: number; discountRate: number;
  remainingQty: number; memberOnly: boolean; locked: boolean; isSponsored: boolean;
  closeAt: string;
};
type Product = {
  id: string; name: string; imageUrl: string | null; basePrice: number; memberPrice: number | null; memberPriceApplies?: boolean;
  type: string; merchant: { name: string; region: { name: string } };
};
type CouponLite = {
  id: string; title: string; type: string; value: number; freebieName: string | null; canUse: boolean;
  merchant: { id: string; name: string; thumbnailUrl: string | null; region: { name: string }; category: { emoji: string } };
};
type PopularCoupon = CouponLite & { useCount: number; estimatedSaving: number | null };
type ProductLite = { id: string; name: string; imageUrl: string | null; type: string; merchant: { id: string; name: string } };
type HomeItem = { kind: 'RESERVATION' | 'TICKET'; id: string; at: string | null; headcount: number; product: ProductLite };
type HomeData = {
  popularCoupons: PopularCoupon[];
  bundleProducts: {
    id: string; name: string; imageUrl: string | null; type: string;
    basePrice: number; memberPrice: number | null; memberPriceApplies: boolean;
    merchant: { name: string; region: { name: string } };
    couponCount: number; coupons: { title: string }[];
  }[];
  starter: { code: string; name: string; price: number; couponCount: number; estCount: number; estSaving: number } | null;
  today: { items: HomeItem[]; coupons: CouponLite[] } | null;
  upcoming: HomeItem[] | null;
};

/** 쿠폰 할인 표시 — 사진 카드 왼쪽 아래 빨간 딱지 */
function couponLabel(t: Tr, b: { type: string; value: number }) {
  return b.type === 'PERCENT'
    ? `${b.value}% ${t('offLabel')}`
    : b.type === 'AMOUNT'
    ? `${b.value.toLocaleString()}원 ${t('offLabel')}`
    : b.type === 'AMOUNT_PER_PERSON'
    ? `${t('perPersonOff')} ${b.value.toLocaleString()}원`
    : t('freeLabel');
}

const DAY_MS = 86_400_000;
const dayStartMs = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
type Campaign = { id: string; title: string; subtitle: string | null; bannerImageUrl: string | null; subsidyLabel: string | null; endAt: string | null };
// 카테고리 타일 그라데이션 팔레트 — 관리자에서 카테고리를 추가/숨김하면 홈에도 그대로 반영된다
const CAT_COLORS: [string, string][] = [
  ['#38BDF8', '#2563EB'], ['#FB7185', '#E11D48'], ['#FBBF24', '#D97706'],
  ['#A78BFA', '#6D28D9'], ['#F472B6', '#C026D3'], ['#4ADE80', '#16A34A'],
  ['#FB923C', '#EA580C'], ['#2DD4BF', '#0D9488'], ['#818CF8', '#4F46E5'],
];

function hoursLeft(t: Tr, closeAt: string) {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return t('closedNow');
  const h = Math.floor(ms / 3600_000);
  return h >= 24 ? t('daysLeft', { d: Math.floor(h / 24) }) : h > 0 ? t('hoursLeft', { h }) : t('minLeft', { m: Math.floor(ms / 60_000) });
}

export default function HomeScreen() {
  const { me } = useAuth();
  const { t, won, lang, locale } = useI18n();
  // null = 아직 로딩(스켈레톤 표시), [] = 진짜 없음
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string; emoji: string | null }[]>([]);
  const [home, setHome] = useState<HomeData | null>(null);
  const [trip, setTrip] = useState<{
    days: number; headcount: number; totalSaving: number; grade: string | null; items: any[];
    recommendedPlan: { code: string; name: string; price: number } | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sortProducts = (p: Product[]) =>
    p.filter((x) => x.type !== 'PASS').concat(p.filter((x) => x.type === 'PASS'));

  const load = useCallback(async () => {
    // ① 직전 캐시로 화면부터 채우고 ② 네트워크 도착분으로 갱신 — 섹션별 독립 로딩 (언어별 캐시)
    cacheGet<Drop[]>(`drops:${lang}`).then((c) => { if (c) setDrops((prev) => prev ?? c); });
    cacheGet<Product[]>(`products:${lang}`).then((c) => { if (c) setProducts((prev) => prev ?? sortProducts(c)); });
    api<Drop[]>('/drops')
      .then((d) => { setDrops(d); cacheSet(`drops:${lang}`, d); })
      .catch(() => setDrops((prev) => prev ?? []));
    api<Product[]>('/products')
      .then((p) => { setProducts(sortProducts(p)); cacheSet(`products:${lang}`, p); })
      .catch(() => setProducts((prev) => prev ?? []));
    api<Campaign[]>('/campaigns/active').then(setCampaigns).catch(() => setCampaigns([]));
    api<{ id: string; name: string; emoji: string | null }[]>('/categories').then(setCats).catch(() => {});
    track('home_view');
    api<HomeData>('/home').then(setHome).catch(() => setHome(null));
    if (me) {
      api<{ trip: any }>('/me/trip').then((r) => setTrip(r.trip)).catch(() => setTrip(null));
    } else setTrip(null);
  }, [me, lang]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const greeting = useMemo(() => pickGreeting(lang), [lang]);
  const isPaid = !!me?.membership?.isPaid;
  // 무료 회원 ① — 여행을 만들었으면 그 여행에 맞는 잼, 아니면 가장 싼 잼
  const starterPlan = trip?.recommendedPlan ?? (home?.starter ? { name: home.starter.name, price: home.starter.price } : null);
  const starterLine =
    trip && trip.totalSaving > 0
      ? t('homeStarterTrip', { amt: won(trip.totalSaving) })
      : home?.starter && home.starter.estSaving > 0
      ? t('homeStarterEst', { n: home.starter.estCount, amt: won(home.starter.estSaving) })
      : home?.starter
      ? t('homeStarterCoupons', { n: home.starter.couponCount })
      : '';
  // 유료 회원 ② — 가진 유료 잼을 끝나는 날이 가까운 순으로
  const paidJams = (me?.memberships ?? [])
    .filter((m) => m.isPaid)
    .sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime())
    .slice(0, 3);
  // 올해가 아니면 연도까지 — 잼마스터는 끝나는 날이 내년이다
  const md = (d: string | Date) => {
    const x = new Date(d);
    return x.toLocaleDateString(locale, { ...(x.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), month: 'long', day: 'numeric' });
  };
  const mdw = (d: string | Date) => new Date(d).toLocaleDateString(locale, { month: 'numeric', day: 'numeric', weekday: 'short' });
  const hm = (d: string | Date) => new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  /** 잼 한 줄 — 'D-1 · 내일 밤 23:59까지' / 시작 전이면 '10월 1일 시작 · 10월 4일 23:59까지' */
  function jamLine(m: { startAt: string; endAt: string; started: boolean }) {
    const last = new Date(new Date(m.endAt).getTime() - 60_000);
    if (!m.started) return { d: '', text: `${t('homeJamStarts', { date: md(m.startAt) })} · ${t('homeJamEndsOn', { date: md(last) })}` };
    const left = Math.round((dayStartMs(last) - dayStartMs(new Date())) / DAY_MS);
    return {
      d: left <= 0 ? 'D-day' : `D-${left}`,
      text: left <= 0 ? t('homeJamEndsToday') : left === 1 ? t('homeJamEndsTomorrow') : t('homeJamEndsOn', { date: md(last) }),
    };
  }
  /** 인기 쿠폰 사진 카드 줄 — 무료 회원 ②, 유료 회원이 오늘 쓸 게 없는 날(3-6 A) */
  const popularRow = (list: PopularCoupon[]) => (
    <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
      {list.slice(0, 8).map((b) => (
        <Pressable key={b.id} style={st.dropCard} onPress={() => router.push(`/store/${b.merchant.id}`)}>
          <View>
            {b.merchant.thumbnailUrl ? (
              <Image source={{ uri: img(b.merchant.thumbnailUrl, 480) }} style={st.dropImg} />
            ) : (
              <View style={[st.dropImg, { backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 30 }}>{b.merchant.category.emoji}</Text>
              </View>
            )}
            <View style={st.couponBadge}><Text style={st.couponBadgeText}>{couponLabel(t, b)}</Text></View>
            {b.useCount > 0 && (
              <View style={st.usedChip}><Text style={st.usedChipText}>🔥 {t('homeUsedTimes', { n: b.useCount })}</Text></View>
            )}
          </View>
          <View style={{ padding: 10 }}>
            <Text style={st.dropTitle} numberOfLines={1}>{b.title}</Text>
            <Text style={st.dropMerchant} numberOfLines={1}>{b.merchant.name} · {b.merchant.region.name}</Text>
          </View>
        </Pressable>
      ))}
    </HScroll>
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />
        }
      >
        {/* ① 딥오션 히어로 + 상태 카드 */}
        <LinearGradient
          colors={['#0284C7', '#0EA5E9', '#38BDF8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1.15, y: 1 }}
          style={st.hero}
        >
          {/* 떠 있는 보석 장식 */}
          <View style={[st.gemDeco, { top: 52, right: 18, width: 72, height: 72, opacity: 0.1, borderRadius: 18 }]} />
          <View style={[st.gemDeco, { top: 116, right: 92, width: 26, height: 26, opacity: 0.16, borderRadius: 7 }]} />
          <View style={[st.gemDeco, { top: 34, right: 128, width: 14, height: 14, opacity: 0.12, borderRadius: 4 }]} />
          <Text style={st.decoSpark}>✦</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo light size={27} />
            <LangButton light />
          </View>
          <Text style={st.greet}>
            {me ? (
              <>
                <Text style={st.greetName}>{t('greetHi', { nick: me.nickname })}</Text>
                {'\n'}{greeting}
              </>
            ) : (
              t('heroGuest')
            )}
          </Text>
          {/* 홈 카피 — "로컬처럼 즐기고, 여행비용은 똑똑하게" (2026-09-09 픽스) */}
          <Text style={st.heroTagline}>{t('heroSub')}</Text>
        </LinearGradient>

        {/* 상태 카드 — 기간잼·여행이 있으면 '내 여행' 요약, 잼마스터는 누적 절약 (2026-09-09 픽스) */}
        <Pressable
          style={st.statusCard}
          onPress={() => router.push((isPaid ? (trip ? '/(tabs)/trip' : '/benefits') : '/(tabs)/jam') as never)}
        >
            {!isPaid && starterPlan ? (
              // 무료 회원 ① 잼 시작하기 + 예상 절약액 (2026-09-19 문서 4-2)
              <View style={st.statusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.statusPlan}>{t('homeStarterTitle', { plan: starterPlan.name, price: won(starterPlan.price) })}</Text>
                  {!!starterLine && <Text style={[st.statusSaving, { color: C.brand, fontWeight: '700' }]}>{starterLine}</Text>}
                </View>
                <Text style={st.loginBtn}>{t('homeStarterCta')}</Text>
              </View>
            ) : me ? (
              <View style={st.statusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.statusPlan}>
                    {me.membership?.isPaid
                      ? (me.membership.started
                          ? t('planInUse', { plan: me.membership.planName })
                          : t('cardUpcoming', { plan: me.membership.planName, date: new Date(me.membership.startAt).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' }) }))
                      : t('startMembership')}
                  </Text>
                  {trip ? (
                    <Text style={st.statusSaving}>
                      {t('tripCardLine', {
                        nights: `${trip.days - 1}`, days: `${trip.days}`, n: trip.headcount,
                        count: trip.items.length, amt: won(trip.totalSaving),
                      })}
                      {trip.grade ? ` · ${trip.grade}` : ''}
                    </Text>
                  ) : (
                    <Text style={st.statusSaving}>
                      {t('savedThisMonth', { amt: won(me.savings.thisMonth) })}
                      {me.savings.recoveryRate != null ? t('recoveryRate', { r: me.savings.recoveryRate }) : ''}
                    </Text>
                  )}
                </View>
                {me.membership?.isPaid && (
                  <View style={{ borderRadius: 999, overflow: 'hidden' }}>
                    <LinearGradient colors={['#F7C64B', '#B07B1E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Text style={st.statusBadge}>💎 {me.membership.planName}</Text>
                    </LinearGradient>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={C.ink3} />
              </View>
            ) : (
              <View style={st.statusRow}>
                <Text style={[st.statusPlan, { flex: 1 }]}>{t('joinCta')}</Text>
                <Text style={st.loginBtn}>{t('start')}</Text>
              </View>
            )}
        </Pressable>

        {/* ─── 무료 회원 ② 인기 쿠폰 · ③ 상품 구매 혜택 ─── */}
        {!isPaid && home && home.popularCoupons.length > 0 && (
          <>
            <View style={st.sectionHead}>
              <View>
                <Text style={st.sectionTitle}>{t('homePopularTitle')}</Text>
                <Text style={st.sectionSub}>{t('homePopularSub')}</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/store')}>
                <Text style={st.more}>{t('more')}</Text>
              </Pressable>
            </View>
            {popularRow(home.popularCoupons)}
          </>
        )}
        {!isPaid && home && home.bundleProducts.length > 0 && (
          <>
            <View style={st.sectionHead}>
              <View>
                <Text style={st.sectionTitle}>{t('homeBundleTitle')}</Text>
                <Text style={st.sectionSub}>{t('homeBundleSub')}</Text>
              </View>
            </View>
            <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {home.bundleProducts.map((p) => (
                <Pressable key={p.id} style={st.prodCard} onPress={() => router.push(`/product/${p.id}`)}>
                  <View>
                    {p.imageUrl ? (
                      <Image source={{ uri: img(p.imageUrl, 480) }} style={st.prodImg} />
                    ) : (
                      <View style={[st.prodImg, { backgroundColor: C.brandSoft }]} />
                    )}
                    <View style={st.bundleBadge}><Text style={st.bundleBadgeText}>🎁 {t('homeBundleBadge', { n: p.couponCount })}</Text></View>
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={st.dropTitle} numberOfLines={1}>{p.name}</Text>
                    <Text style={st.dropMerchant} numberOfLines={1}>{p.merchant.region.name} · {p.merchant.name}</Text>
                    <View style={st.dropPriceRow}>
                      {p.memberPriceApplies ? (
                        <>
                          <Text style={st.memberTag}>{t('memberPrice')}</Text>
                          <Text style={st.prodPrice}>{won(p.memberPrice ?? p.basePrice)}</Text>
                        </>
                      ) : (
                        <Text style={st.prodPrice}>{won(p.basePrice)}</Text>
                      )}
                    </View>
                    {p.coupons[0] && <Text style={st.bundleLine} numberOfLines={1}>+ {p.coupons[0].title}</Text>}
                  </View>
                </Pressable>
              ))}
            </HScroll>
          </>
        )}

        {/* ─── 유료 회원 ① 오늘 사용할 혜택 — 비는 날은 인기 쿠폰 (3-6 A) ─── */}
        {isPaid && home?.today && (
          <>
            <View style={st.sectionHead}>
              <View>
                <Text style={st.sectionTitle}>{t('homeTodayTitle')}</Text>
                {home.today.items.length + home.today.coupons.length === 0 && (
                  <Text style={st.sectionSub}>{t('homeTodayEmpty')}</Text>
                )}
              </View>
              <Pressable onPress={() => router.push('/(tabs)/trip' as never)}>
                <Text style={st.more}>{t('homeTodayPlan')}</Text>
              </Pressable>
            </View>
            {home.today.items.length + home.today.coupons.length === 0 ? (
              // '오늘 사용할' 칸이라 내 잼으로 쓸 수 있는 쿠폰만. 하나도 없으면 전체 인기 쿠폰
              popularRow(home.popularCoupons.some((c) => c.canUse) ? home.popularCoupons.filter((c) => c.canUse) : home.popularCoupons)
            ) : (
              <View style={st.listCard}>
                {home.today.items.map((it, i) => (
                  <Pressable key={it.id} style={[st.listRow, i > 0 && st.listDivider]} onPress={() => router.push('/wallet')}>
                    <View style={st.listIcon}><Text style={{ fontSize: 16 }}>{it.kind === 'RESERVATION' ? '⏰' : '🎫'}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.listTitle} numberOfLines={1}>{it.product.name}</Text>
                      <Text style={st.listSub} numberOfLines={1}>
                        {it.kind === 'RESERVATION' ? `${hm(it.at!)} · ${t('people', { n: it.headcount })}` : t('homeTodayVisit')} · {it.product.merchant.name}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.ink3} />
                  </Pressable>
                ))}
                {home.today.coupons.length > 0 && (
                  <Text style={[st.listHead, home.today.items.length > 0 && st.listDivider]}>
                    {t('homeTodayCoupons', { n: home.today.coupons.length })}
                  </Text>
                )}
                {home.today.coupons.map((b) => (
                  <Pressable key={b.id} style={st.listRow} onPress={() => router.push(`/store/${b.merchant.id}`)}>
                    <View style={st.valueBox}><Text style={st.valueText} numberOfLines={1}>{couponLabel(t, b)}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.listTitle} numberOfLines={1}>{b.title}</Text>
                      <Text style={st.listSub} numberOfLines={1}>{b.merchant.category.emoji} {b.merchant.name} · {b.merchant.region.name}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.ink3} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {/* ─── 유료 회원 ② 만료 예정 잼 ─── */}
        {isPaid && paidJams.length > 0 && (
          <>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>{t('homeJamsTitle')}</Text>
              <Pressable onPress={() => router.push('/(tabs)/jam' as never)}>
                <Text style={st.more}>{t('more')}</Text>
              </Pressable>
            </View>
            <View style={st.listCard}>
              {paidJams.map((m, i) => {
                const l = jamLine(m);
                const soon = l.d === 'D-day' || l.d === 'D-1';
                return (
                  <View key={`${m.planCode}-${m.endAt}`} style={[st.listRow, i > 0 && st.listDivider]}>
                    <View style={st.listIcon}><Text style={{ fontSize: 16 }}>💎</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.listTitle} numberOfLines={1}>{m.planName}</Text>
                      <Text style={st.listSub} numberOfLines={1}>{l.text}</Text>
                    </View>
                    {!!l.d && <Text style={[st.dPill, soon && st.dPillSoon]}>{l.d}</Text>}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ─── 유료 회원 ③ 예약·구매 상품 ─── */}
        {isPaid && home?.upcoming && (
          <>
            <View style={st.sectionHead}>
              <Text style={st.sectionTitle}>{t('homeUpcomingTitle')}</Text>
              <Pressable onPress={() => router.push('/wallet')}>
                <Text style={st.more}>{t('more')}</Text>
              </Pressable>
            </View>
            <View style={st.listCard}>
              {home.upcoming.length === 0 && (
                <Pressable style={st.listRow} onPress={() => router.push('/products' as never)}>
                  <Text style={[st.listSub, { flex: 1 }]}>{t('homeUpcomingEmpty')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.ink3} />
                </Pressable>
              )}
              {home.upcoming.map((u, i) => (
                <Pressable key={u.id} style={[st.listRow, i > 0 && st.listDivider]} onPress={() => router.push('/wallet')}>
                  <View style={st.listIcon}><Text style={{ fontSize: 16 }}>{u.kind === 'RESERVATION' ? '📅' : '🎫'}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.listTitle} numberOfLines={1}>{u.product.name}</Text>
                    <Text style={st.listSub} numberOfLines={1}>
                      {u.kind === 'RESERVATION'
                        ? `${mdw(u.at!)} ${hm(u.at!)} · ${t('people', { n: u.headcount })}`
                        : u.at ? t('homeVisitDay', { date: mdw(u.at) }) : t('anytime')} · {u.product.merchant.name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.ink3} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* ①-a 기획전 배너 — 가로 슬라이드(2026-09-08 픽스). 관리자가 노출·순서·기간을 제어하고 기간이 지나면 자동으로 사라진다 */}
        {campaigns.length > 0 && (
          <HScroll
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 18 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          >
            {campaigns.map((c) => (
              <Pressable
                key={c.id}
                style={st.campCard}
                onPress={() => { track('campaign_click', { type: 'campaign', id: c.id }); router.push(`/campaign/${c.id}` as never); }}
              >
                {c.bannerImageUrl ? (
                  <Image source={{ uri: img(c.bannerImageUrl, 960) }} style={st.campImg} />
                ) : (
                  <View style={[st.campImg, { backgroundColor: C.brand }]} />
                )}
                <LinearGradient
                  colors={['rgba(10,18,26,0.05)', 'rgba(10,18,26,0.72)']}
                  style={st.campImg}
                />
                {!!c.subsidyLabel && (
                  <View style={st.campChip}><Text style={st.campChipText}>🏛 {c.subsidyLabel}</Text></View>
                )}
                {!!c.endAt && (
                  <View style={st.campEnd}><Text style={st.campEndText}>
                    ~{new Date(c.endAt).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })}
                  </Text></View>
                )}
                <View style={st.campBody}>
                  <Text style={st.campTitle} numberOfLines={1}>{c.title}</Text>
                  {!!c.subtitle && <Text style={st.campSub} numberOfLines={1}>{c.subtitle}</Text>}
                </View>
              </Pressable>
            ))}
          </HScroll>
        )}

        {/* ③ 오늘 도착한 DROP */}
        <View style={st.sectionHead}>
          <View>
            <Text style={st.sectionTitle}>{t('dropSection')}</Text>
            <Text style={st.sectionSub}>{t('dropSectionSub')}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/drops')}>
            <Text style={st.more}>{t('more')}</Text>
          </Pressable>
        </View>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {drops === null && [1, 2, 3].map((k) => (
            <View key={k} style={st.dropCard}>
              <View style={[st.dropImg, st.skel]} />
              <View style={{ padding: 10, gap: 7 }}>
                <View style={[st.skel, { height: 14, width: '85%' }]} />
                <View style={[st.skel, { height: 11, width: '60%' }]} />
                <View style={[st.skel, { height: 15, width: '45%' }]} />
              </View>
            </View>
          ))}
          {(drops ?? []).slice(0, 6).map((d) => (
            <Pressable key={d.id} style={st.dropCard} onPress={() => router.push(`/drop/${d.id}`)}>
              <View>
                {d.imageUrl ? (
                  <Image source={{ uri: img(d.imageUrl, 480) }} style={st.dropImg} />
                ) : (
                  <View style={[st.dropImg, { backgroundColor: C.brandSoft }]} />
                )}
                <View style={st.dropQty}><Text style={st.dropQtyText}>{t('qtyLeft', { n: d.remainingQty })}</Text></View>
                {d.locked && <View style={st.lockOverlay}><Text style={st.lockEmoji}>🔒</Text></View>}
              </View>
              <View style={{ padding: 10 }}>
                <Text style={st.dropTitle} numberOfLines={1}>{d.title}</Text>
                <Text style={st.dropMerchant} numberOfLines={1}>{d.merchant.name} · {hoursLeft(t, d.closeAt)}</Text>
                <View style={st.dropPriceRow}>
                  <Text style={st.dropRate}>{d.discountRate}%</Text>
                  <Text style={st.dropPrice}>{won(d.dropPrice)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </HScroll>

        {/* ④ 액티비티 예약 — 쿠폰·DROP과 같은 패턴: 슬라이드 + 전체보기(필터) (2026-09-08 UI 통일) */}
        <View style={st.sectionHead}>
          <View>
            <Text style={st.sectionTitle}>{t('activitySection')}</Text>
            <Text style={st.sectionSub}>{t('activitySectionSub')}</Text>
          </View>
          <Pressable onPress={() => router.push('/products' as never)}>
            <Text style={st.more}>{t('more')}</Text>
          </Pressable>
        </View>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {products === null && [1, 2, 3].map((k) => (
            <View key={k} style={st.prodCard}>
              <View style={[st.prodImg, st.skel]} />
              <View style={{ padding: 10, gap: 7 }}>
                <View style={[st.skel, { height: 14, width: '85%' }]} />
                <View style={[st.skel, { height: 11, width: '60%' }]} />
              </View>
            </View>
          ))}
          {(products ?? []).slice(0, 6).map((p) => (
            <Pressable key={p.id} style={st.prodCard} onPress={() => router.push(`/product/${p.id}`)}>
              {p.imageUrl ? (
                <Image source={{ uri: img(p.imageUrl, 480) }} style={st.prodImg} />
              ) : (
                <View style={[st.prodImg, { backgroundColor: C.brandSoft }]} />
              )}
              <View style={{ padding: 10 }}>
                <Text style={st.dropTitle} numberOfLines={1}>{p.name}</Text>
                <Text style={st.dropMerchant} numberOfLines={1}>{p.merchant.region.name} · {p.merchant.name}</Text>
                <View style={st.dropPriceRow}>
                  {p.memberPriceApplies ? (
                    <>
                      <Text style={st.memberTag}>{t('memberPrice')}</Text>
                      <Text style={st.prodPrice}>{won(p.memberPrice ?? p.basePrice)}</Text>
                    </>
                  ) : (
                    <Text style={st.prodPrice}>{won(p.basePrice)}</Text>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </HScroll>

        {/* (구) "지금 쓸 수 있는 내 혜택" 섹션은 할인 쿠폰 섹션과 중복이라 제거 (2026-09-08) */}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  skel: { backgroundColor: C.line, borderRadius: 7, opacity: 0.6 },
  hero: {
    paddingTop: 54, paddingBottom: 52, paddingHorizontal: 20,
    borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden',
  },
  gemDeco: { position: 'absolute', backgroundColor: '#fff', transform: [{ rotate: '45deg' }] },
  decoSpark: { position: 'absolute', top: 96, right: 52, color: '#FFD983', fontSize: 15 },
  greet: { fontSize: 24, fontWeight: '700', color: '#fff', marginTop: 14, letterSpacing: -0.3, lineHeight: 32 },
  greetName: { fontSize: 15, fontWeight: '700', color: 'rgba(213,236,255,0.95)', letterSpacing: 0 },
  heroTagline: { fontSize: 13, fontWeight: '600', color: 'rgba(213,236,255,0.9)', marginTop: 7 },
  statusCard: {
    backgroundColor: C.white, borderRadius: 18, padding: 15,
    marginTop: -32, marginHorizontal: 16,
    shadowColor: '#0284C7', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 6, borderWidth: 1, borderColor: '#EAF0F6',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusPlan: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  statusSaving: { fontSize: 12.5, color: C.ink2, marginTop: 3 },
  statusBadge: { color: '#4A2E00', fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4.5 },
  loginBtn: { backgroundColor: C.brand, color: '#fff', fontSize: 13, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, marginTop: 24, marginBottom: 11 },
  campCard: { height: 118, width: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: C.ink },
  campEnd: {
    position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(10,18,26,0.55)',
    borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3,
  },
  campEndText: { fontSize: 10.5, fontWeight: '700', color: '#fff' },
  campImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  campChip: {
    position: 'absolute', top: 10, left: 10, backgroundColor: '#fff',
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3.5,
  },
  campChipText: { fontSize: 10.5, fontWeight: '700', color: C.brand },
  campBody: { flex: 1, justifyContent: 'flex-end', padding: 13 },
  campTitle: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  campSub: { color: 'rgba(255,255,255,0.88)', fontSize: 11.5, marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.ink, letterSpacing: -0.3 },
  sectionSub: { fontSize: 12, color: C.ink3, marginTop: 2 },
  more: { fontSize: 12.5, fontWeight: '700', color: C.brand },

  dropCard: { width: 168, backgroundColor: C.white, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  dropImg: { width: '100%', height: 108 },
  dropQty: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(18,24,31,0.78)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  dropQtyText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,24,31,0.45)', alignItems: 'center', justifyContent: 'center' },
  lockEmoji: { fontSize: 26 },
  dropTitle: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  dropMerchant: { fontSize: 11, color: C.ink3, marginTop: 2 },
  couponBadge: {
    position: 'absolute', left: 8, bottom: 8, backgroundColor: '#E8503A',
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  couponBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  usedChip: {
    position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2.5,
  },
  usedChipText: { color: '#C2410C', fontSize: 10.5, fontWeight: '800' },
  bundleBadge: {
    position: 'absolute', left: 8, bottom: 8, backgroundColor: C.brand,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  bundleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  bundleLine: { fontSize: 11, fontWeight: '700', color: C.brand, marginTop: 5 },
  listCard: {
    marginHorizontal: 16, backgroundColor: C.white, borderRadius: 16,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 4,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  listDivider: { borderTopWidth: 1, borderTopColor: C.line },
  listHead: { fontSize: 12, fontWeight: '800', color: C.ink2, paddingTop: 11, paddingBottom: 2 },
  listIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.ground, alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  listSub: { fontSize: 12, color: C.ink3, marginTop: 2 },
  valueBox: { minWidth: 56, maxWidth: 92, borderRadius: 9, backgroundColor: '#FFF1EC', paddingVertical: 7, paddingHorizontal: 6, alignItems: 'center' },
  valueText: { fontSize: 12, fontWeight: '800', color: '#E8503A' },
  dPill: {
    fontSize: 12, fontWeight: '800', color: C.brand, backgroundColor: C.brandSoft,
    borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden',
  },
  dPillSoon: { color: '#C2410C', backgroundColor: '#FFEDD5' },
  dropPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 5 },
  dropRate: { fontSize: 14, fontWeight: '700', color: '#E8503A' },
  dropPrice: { fontSize: 14, fontWeight: '700', color: C.ink },

  cat: { alignItems: 'center', gap: 7 },
  catTile: {
    width: 58, height: 58, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  catGloss: {
    position: 'absolute', top: -14, left: -14, width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  catLabel: { fontSize: 11.5, fontWeight: '700', color: C.ink2, letterSpacing: -0.2 },
  catEmoji: { fontSize: 24 },

  prodCard: { width: 200, backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  prodImg: { width: '100%', height: 120 },
  prodBody: { padding: 12 },
  prodName: { fontSize: 15.5, fontWeight: '700', color: C.ink },
  prodMerchant: { fontSize: 12, color: C.ink3, marginTop: 2 },
  prodPrice: { fontSize: 15, fontWeight: '700', color: C.ink },
  prodNormal: { fontSize: 12, color: C.ink3, textDecorationLine: 'line-through' },
  memberTag: { fontSize: 10.5, fontWeight: '700', color: C.gold, backgroundColor: '#F6EBD4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },

  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.white, borderRadius: 13, borderWidth: 1, borderColor: C.line, padding: 10 },
  benefitThumb: { width: 46, height: 46, borderRadius: 10 },
  benefitName: { fontSize: 14, fontWeight: '700', color: C.ink },
  benefitDesc: { fontSize: 12, color: C.ink2, marginTop: 1 },
  benefitRegion: { fontSize: 11.5, color: C.ink3, fontWeight: '600' },
});
