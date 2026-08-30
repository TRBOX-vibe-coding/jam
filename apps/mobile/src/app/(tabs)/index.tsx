/**
 * 홈 — 커플패스 홈 구조 + 오전열시 "매일 도착" 리듬.
 *  ① 인사 + 내 상태 카드 (멤버십·절약액·바로가기 3버튼)
 *  ② 오늘 도착한 DROP (매일 아침 10시 도착 — 가로 스크롤 사진 카드)
 *  ③ 액티비티 예약 (프립 스타일 — 원형 카테고리 + 대형 사진 카드)
 *  ④ 내 혜택 매장
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, cacheGet, cacheSet, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { C, won } from '../../lib/theme';
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

// 카테고리 타일 — 카테고리마다 고유 그라데이션 + 흰 라인 아이콘 (MZ 톤)
const CATS: { code: string; label: string; icon: keyof typeof Ionicons.glyphMap; colors: [string, string] }[] = [
  { code: 'marine', label: '해양레저', icon: 'boat-outline', colors: ['#38BDF8', '#2563EB'] },
  { code: 'food', label: '맛집', icon: 'restaurant-outline', colors: ['#FB7185', '#E11D48'] },
  { code: 'cafe', label: '카페', icon: 'cafe-outline', colors: ['#FBBF24', '#D97706'] },
  { code: 'bar', label: '펍·바', icon: 'wine-outline', colors: ['#A78BFA', '#6D28D9'] },
  { code: 'exhibit', label: '전시', icon: 'color-palette-outline', colors: ['#F472B6', '#C026D3'] },
  { code: 'kids', label: '키즈', icon: 'happy-outline', colors: ['#4ADE80', '#16A34A'] },
];

/**
 * 시간대·요일에 따라 달라지는 환영 문구. 열 때마다 풀에서 랜덤으로 하나 뽑는다.
 * "살아있는 서비스" 느낌 — 같은 앱을 두 번 열어도 인사가 조금씩 다르다.
 */
function pickGreeting(): string {
  const now = new Date();
  const h = now.getHours();
  const day = now.getDay(); // 0=일 5=금 6=토
  const pool: string[] = [];

  if (h >= 5 && h < 11) {
    pool.push('오늘 부산 날씨 최고예요 ☀️', '아침 10시, 새 DROP 도착했어요 ⚡', '오늘 부산은 어때요?');
  } else if (h >= 11 && h < 17) {
    pool.push('오후엔 바다 어때요? 🌊', '지금 마감 임박 딜이 있어요 ⏰', '오늘 부산은 어때요?');
  } else if (h >= 17 && h < 23) {
    pool.push('오늘 밤, 한 잔 어때요? 🍹', '저녁 한정 딜이 열렸어요 🌙');
    if (day === 5) pool.push('불금이에요! 🔥 오늘 밤 딜 놓치지 마요');
  } else {
    pool.push('내일의 부산을 미리 찜해요 🌙', '못 자는 밤엔 딜 구경 어때요? ✨');
  }
  if ((day === 6 || day === 0) && h >= 8 && h < 20) {
    pool.push('주말의 부산, 놓치지 마요 🏖️');
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function hoursLeft(closeAt: string) {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return '마감';
  const h = Math.floor(ms / 3600_000);
  return h >= 24 ? `${Math.floor(h / 24)}일 남음` : h > 0 ? `${h}시간 남음` : `${Math.floor(ms / 60_000)}분 남음`;
}

export default function HomeScreen() {
  const { me } = useAuth();
  // null = 아직 로딩(스켈레톤 표시), [] = 진짜 없음
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [benefits, setBenefits] = useState<BenefitGroup[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const sortProducts = (p: Product[]) =>
    p.filter((x) => x.type !== 'PASS').concat(p.filter((x) => x.type === 'PASS'));

  const load = useCallback(async () => {
    // ① 직전 캐시로 화면부터 채우고 ② 네트워크 도착분으로 갱신 — 섹션별 독립 로딩
    cacheGet<Drop[]>('drops').then((c) => { if (c) setDrops((prev) => prev ?? c); });
    cacheGet<Product[]>('products').then((c) => { if (c) setProducts((prev) => prev ?? sortProducts(c)); });
    api<Drop[]>('/drops')
      .then((d) => { setDrops(d); cacheSet('drops', d); })
      .catch(() => setDrops((prev) => prev ?? []));
    api<Product[]>('/products')
      .then((p) => { setProducts(sortProducts(p)); cacheSet('products', p); })
      .catch(() => setProducts((prev) => prev ?? []));
    if (me) {
      api<{ merchants: BenefitGroup[] }>('/me/benefits')
        .then((b) => setBenefits(b.merchants))
        .catch(() => setBenefits([]));
    } else setBenefits([]);
  }, [me]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const greetName = me ? `${me.nickname}님` : '홀릭잼';
  const greeting = useMemo(pickGreeting, []);

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

          <Logo light size={27} />
          <Text style={st.greet}>
            {me ? (
              <>
                <Text style={st.greetName}>{greetName} 👋</Text>
                {'\n'}{greeting}
              </>
            ) : (
              <>부산 놀러갈 땐,{'\n'}홀릭잼 🌊</>
            )}
          </Text>
        </LinearGradient>

        <Pressable style={st.statusCard} onPress={() => router.push(me ? '/benefits' : '/(tabs)/my')}>
            {me ? (
              <View style={st.statusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.statusPlan}>
                    {me.membership ? `${me.membership.planName} 이용 중` : '멤버십을 시작해 보세요'}
                  </Text>
                  <Text style={st.statusSaving}>
                    이번 달 <Text style={{ color: C.brand, fontWeight: '700' }}>{won(me.savings.thisMonth)}</Text> 아꼈어요
                    {me.savings.recoveryRate != null ? ` · 회수율 ${me.savings.recoveryRate}%` : ''}
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
                <Text style={[st.statusPlan, { flex: 1 }]}>3초 간편가입하고 오늘 혜택 받기</Text>
                <Text style={st.loginBtn}>시작하기</Text>
              </View>
            )}
        </Pressable>

        {/* ② 오늘 도착한 DROP */}
        <View style={st.sectionHead}>
          <View>
            <Text style={st.sectionTitle}>오늘 도착한 DROP ⚡</Text>
            <Text style={st.sectionSub}>매일 아침 10시, 한정수량으로 열려요</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/drops')}>
            <Text style={st.more}>전체보기</Text>
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
                <View style={st.dropQty}><Text style={st.dropQtyText}>{d.remainingQty}개 남음</Text></View>
                {d.locked && <View style={st.lockOverlay}><Text style={st.lockEmoji}>🔒</Text></View>}
              </View>
              <View style={{ padding: 10 }}>
                <Text style={st.dropTitle} numberOfLines={1}>{d.title}</Text>
                <Text style={st.dropMerchant} numberOfLines={1}>{d.merchant.name} · {hoursLeft(d.closeAt)}</Text>
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
            <Text style={st.sectionTitle}>바다부터 도심까지 🏄</Text>
            <Text style={st.sectionSub}>결제하면 예약까지 한 번에 끝나요</Text>
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
              <Text style={st.catLabel}>{c.label}</Text>
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
                      <Text style={st.memberTag}>멤버십가</Text>
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
                <Text style={st.sectionTitle}>지금 쓸 수 있는 내 혜택 🎁</Text>
                <Text style={st.sectionSub}>{benefits.length}개 매장에서 기다리고 있어요</Text>
              </View>
              <Pressable onPress={() => router.push('/benefits')}>
                <Text style={st.more}>전체보기</Text>
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
