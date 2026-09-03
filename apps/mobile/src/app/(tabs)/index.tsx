/**
 * 홈 — 커플패스 홈 구조 + 오전열시 "매일 도착" 리듬.
 *  ① 인사 + 내 상태 카드 (멤버십·절약액·바로가기 3버튼)
 *  ② 오늘 도착한 DROP (매일 아침 10시 도착 — 가로 스크롤 사진 카드)
 *  ③ 액티비티 예약 (프립 스타일 — 원형 카테고리 + 대형 사진 카드)
 *  ④ 내 혜택 매장
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, cacheGet, cacheSet, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LangButton, pickGreeting, useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Screen } from '../../lib/ui';
import { HScroll } from '../../lib/hscroll';
import { Logo } from '../../lib/logo';

type Drop = {
  id: string; title: string; imageUrl: string | null;
  merchant: { name: string }; region: { name: string };
  normalPrice: number; dropPrice: number; discountRate: number;
  remainingQty: number; memberOnly: boolean; locked: boolean; isSponsored: boolean;
  closeAt: string;
};
type Product = {
  id: string; name: string; imageUrl: string | null; basePrice: number; memberPrice: number | null;
  type: string; merchant: { name: string; region: { name: string } };
};
type BenefitGroup = {
  merchant: { id: string; name: string; thumbnailUrl: string | null; region: { name: string }; category: { emoji: string } };
  items: { title: string }[];
};
type CouponSlot = { time: string; opensAt: string; closesAt: string; state: 'upcoming' | 'open' | 'soldout' | 'ended'; remaining: number; total: number };
type CouponDrop = {
  id: string; validHours: number;
  benefit: { title: string; type: string; value: number; freebieName: string | null; merchantName: string; regionName: string };
  slots: CouponSlot[];
};

function notifyHome(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** 다음 오픈까지 남은 시간 문구 */
function untilText(t: Tr, opensAt: string, now: number) {
  const ms = new Date(opensAt).getTime() - now;
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? t('opensInHM', { h, m }) : t('opensInMS', { m, s: String(s).padStart(2, '0') });
}

// 카테고리 타일 — 카테고리마다 고유 그라데이션 + 흰 라인 아이콘 (MZ 톤)
const CATS: { code: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap; colors: [string, string] }[] = [
  { code: 'marine', labelKey: 'catMarine', icon: 'boat-outline', colors: ['#38BDF8', '#2563EB'] },
  { code: 'food', labelKey: 'catFood', icon: 'restaurant-outline', colors: ['#FB7185', '#E11D48'] },
  { code: 'cafe', labelKey: 'catCafe', icon: 'cafe-outline', colors: ['#FBBF24', '#D97706'] },
  { code: 'bar', labelKey: 'catBar', icon: 'wine-outline', colors: ['#A78BFA', '#6D28D9'] },
  { code: 'exhibit', labelKey: 'catExhibit', icon: 'color-palette-outline', colors: ['#F472B6', '#C026D3'] },
  { code: 'kids', labelKey: 'catKids', icon: 'happy-outline', colors: ['#4ADE80', '#16A34A'] },
];

function hoursLeft(t: Tr, closeAt: string) {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return t('closedNow');
  const h = Math.floor(ms / 3600_000);
  return h >= 24 ? t('daysLeft', { d: Math.floor(h / 24) }) : h > 0 ? t('hoursLeft', { h }) : t('minLeft', { m: Math.floor(ms / 60_000) });
}

export default function HomeScreen() {
  const { me } = useAuth();
  const { t, won, lang } = useI18n();
  // null = 아직 로딩(스켈레톤 표시), [] = 진짜 없음
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [benefits, setBenefits] = useState<BenefitGroup[]>([]);
  const [coupons, setCoupons] = useState<CouponDrop[]>([]);
  const [couponBusy, setCouponBusy] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  // 쿠폰 카운트다운용 1초 시계 — 쿠폰 섹션이 있을 때만 돈다
  useEffect(() => {
    if (coupons.length === 0) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [coupons.length]);

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
    if (me) {
      api<{ merchants: BenefitGroup[] }>('/me/benefits')
        .then((b) => setBenefits(b.merchants))
        .catch(() => setBenefits([]));
    } else setBenefits([]);
    // 타임 쿠폰 — 멤버십 회원에겐 안 보여주므로 비멤버/비로그인일 때만 조회
    if (!me?.membership) {
      api<{ drops: CouponDrop[] }>('/coupon-drops/today')
        .then((r) => setCoupons(r.drops))
        .catch(() => setCoupons([]));
    } else setCoupons([]);
  }, [me, lang]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const greeting = useMemo(() => pickGreeting(lang), [lang]);

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
        </LinearGradient>

        <Pressable style={st.statusCard} onPress={() => router.push(me ? '/benefits' : '/(tabs)/my')}>
            {me ? (
              <View style={st.statusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.statusPlan}>
                    {me.membership ? t('planInUse', { plan: me.membership.planName }) : t('startMembership')}
                  </Text>
                  <Text style={st.statusSaving}>
                    {t('savedThisMonth', { amt: won(me.savings.thisMonth) })}
                    {me.savings.recoveryRate != null ? t('recoveryRate', { r: me.savings.recoveryRate }) : ''}
                  </Text>
                </View>
                {me.membership && (
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

        {/* ①-b 오늘의 무료 쿠폰 — 비멤버 전용. 시간 한정·선착순으로 멤버십 전환을 유도한다 */}
        {!me?.membership && coupons.length > 0 && (
          <View style={st.couponWrap}>
            <View style={st.sectionHead}>
              <View>
                <Text style={st.sectionTitle}>{t('couponSection')}</Text>
                <Text style={st.sectionSub}>{t('couponSectionSub')}</Text>
              </View>
            </View>
            {coupons.map((cd) => {
              const open = cd.slots.find((s) => s.state === 'open');
              const upcoming = cd.slots.find((s) => s.state === 'upcoming');
              const soldout = !open && cd.slots.find((s) => s.state === 'soldout');
              const timesLabel = cd.slots.map((s) => s.time).join(' · ');
              return (
                <View key={cd.id} style={st.couponCard}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.couponTitle} numberOfLines={1}>{cd.benefit.title}</Text>
                    <Text style={st.couponSub} numberOfLines={1}>
                      {t('couponMeta', { name: cd.benefit.merchantName, times: timesLabel, h: cd.validHours })}
                    </Text>
                  </View>
                  {open ? (
                    <Pressable
                      style={st.couponBtn}
                      onPress={async () => {
                        if (!me) { router.push('/(tabs)/my'); return; }
                        if (couponBusy) return;
                        setCouponBusy(true);
                        try {
                          const r = await api<any>(`/coupon-drops/${cd.id}/claim`, { method: 'POST', body: {} });
                          notifyHome(t('couponGot'), r.message);
                          load().catch(() => {});
                        } catch (e: any) {
                          notifyHome(t('couponFail'), e.message);
                        } finally {
                          setCouponBusy(false);
                        }
                      }}
                    >
                      <Text style={st.couponBtnText}>{t('claim')}</Text>
                      <Text style={st.couponBtnSub}>{t('couponLeft', { n: open.remaining })}</Text>
                    </Pressable>
                  ) : upcoming ? (
                    <View style={st.couponWait}>
                      <Text style={st.couponWaitTime}>{t('opensAt', { time: upcoming.time })}</Text>
                      <Text style={st.couponWaitSub}>{untilText(t, upcoming.opensAt, nowTick)}</Text>
                    </View>
                  ) : (
                    <View style={st.couponWait}>
                      <Text style={st.couponWaitTime}>{soldout ? t('couponSoldout') : t('couponEnded')}</Text>
                      <Text style={st.couponWaitSub}>{t('couponTomorrow', { time: cd.slots[0]?.time ?? '' })}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <Pressable onPress={() => router.push('/(tabs)/my')}>
              <Text style={st.couponUpsell}>{t('couponUpsell')}</Text>
            </Pressable>
          </View>
        )}

        {/* ② 오늘 도착한 DROP */}
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

        {/* ③ 액티비티 예약 */}
        <View style={st.sectionHead}>
          <View>
            <Text style={st.sectionTitle}>{t('activitySection')}</Text>
            <Text style={st.sectionSub}>{t('activitySectionSub')}</Text>
          </View>
        </View>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
          {CATS.map((c) => (
            <Pressable key={c.code} style={st.cat} onPress={() => router.push('/(tabs)/store')}>
              <LinearGradient
                colors={c.colors}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={st.catTile}
              >
                <View style={st.catGloss} />
                <Ionicons name={c.icon} size={24} color="#fff" />
              </LinearGradient>
              <Text style={st.catLabel}>{t(c.labelKey)}</Text>
            </Pressable>
          ))}
        </HScroll>
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 12 }}>
          {products === null && [1, 2].map((k) => (
            <View key={k} style={st.prodCard}>
              <View style={[st.prodImg, st.skel]} />
              <View style={[st.prodBody, { gap: 8 }]}>
                <View style={[st.skel, { height: 15, width: '70%' }]} />
                <View style={[st.skel, { height: 12, width: '45%' }]} />
                <View style={[st.skel, { height: 16, width: '55%' }]} />
              </View>
            </View>
          ))}
          {(products ?? []).slice(0, 3).map((p) => (
            <Pressable key={p.id} style={st.prodCard} onPress={() => router.push(`/product/${p.id}`)}>
              {p.imageUrl ? (
                <Image source={{ uri: img(p.imageUrl, 640) }} style={st.prodImg} />
              ) : (
                <View style={[st.prodImg, { backgroundColor: C.brandSoft }]} />
              )}
              <View style={st.prodBody}>
                <Text style={st.prodName} numberOfLines={1}>{p.name}</Text>
                <Text style={st.prodMerchant}>{p.merchant.region.name} · {p.merchant.name}</Text>
                <View style={st.dropPriceRow}>
                  {p.memberPrice != null ? (
                    <>
                      <Text style={st.memberTag}>{t('memberPrice')}</Text>
                      <Text style={st.prodPrice}>{won(p.memberPrice)}</Text>
                      <Text style={st.prodNormal}>{won(p.basePrice)}</Text>
                    </>
                  ) : (
                    <Text style={st.prodPrice}>{won(p.basePrice)}</Text>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ④ 내 혜택 매장 */}
        {me && benefits.length > 0 && (
          <>
            <View style={st.sectionHead}>
              <View>
                <Text style={st.sectionTitle}>{t('myBenefitSection')}</Text>
                <Text style={st.sectionSub}>{t('myBenefitSectionSub', { n: benefits.length })}</Text>
              </View>
              <Pressable onPress={() => router.push('/benefits')}>
                <Text style={st.more}>{t('more')}</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {benefits.slice(0, 4).map((g) => (
                <Pressable key={g.merchant.id} style={st.benefitRow} onPress={() => router.push(`/store/${g.merchant.id}`)}>
                  {g.merchant.thumbnailUrl ? (
                    <Image source={{ uri: g.merchant.thumbnailUrl }} style={st.benefitThumb} />
                  ) : (
                    <View style={[st.benefitThumb, { backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text>{g.merchant.category.emoji}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={st.benefitName}>{g.merchant.name}</Text>
                    <Text style={st.benefitDesc} numberOfLines={1}>{g.items[0]?.title}</Text>
                  </View>
                  <Text style={st.benefitRegion}>{g.merchant.region.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
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
  couponWrap: { marginTop: 2 },
  couponCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.brandSoft, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 16, marginBottom: 8,
  },
  couponTitle: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  couponSub: { fontSize: 11.5, color: C.ink3, marginTop: 3 },
  couponBtn: {
    backgroundColor: C.brand, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 8,
    alignItems: 'center', minWidth: 76,
  },
  couponBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  couponBtnSub: { color: '#CFE8F8', fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  couponWait: { alignItems: 'flex-end', minWidth: 96 },
  couponWaitTime: { fontSize: 13.5, fontWeight: '700', color: C.brand },
  couponWaitSub: { fontSize: 10.5, color: C.ink3, marginTop: 2, fontVariant: ['tabular-nums'] },
  couponUpsell: {
    fontSize: 12, fontWeight: '700', color: C.brand, textAlign: 'center',
    marginTop: 2, marginBottom: 2, textDecorationLine: 'underline',
  },
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

  prodCard: { backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  prodImg: { width: '100%', height: 150 },
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
