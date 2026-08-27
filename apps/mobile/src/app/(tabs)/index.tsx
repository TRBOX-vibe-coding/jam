/**
 * 홈 — 커플패스 홈 구조 + 오전열시 "매일 도착" 리듬.
 *  ① 인사 + 내 상태 카드 (멤버십·절약액·바로가기 3버튼)
 *  ② 오늘 도착한 DROP (매일 아침 10시 도착 — 가로 스크롤 사진 카드)
 *  ③ 액티비티 예약 (프립 스타일 — 원형 카테고리 + 대형 사진 카드)
 *  ④ 내 혜택 매장
 */
import { useCallback, useState } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { C, won } from '../../lib/theme';
import { Screen } from '../../lib/ui';

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

const CATS = [
  { code: 'marine', emoji: '🌊', label: '해양레저' },
  { code: 'food', emoji: '🍽️', label: '맛집' },
  { code: 'cafe', emoji: '☕', label: '카페' },
  { code: 'bar', emoji: '🍸', label: '펍·바' },
  { code: 'exhibit', emoji: '🎨', label: '전시' },
  { code: 'kids', emoji: '🧸', label: '키즈' },
];

function hoursLeft(closeAt: string) {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return '마감';
  const h = Math.floor(ms / 3600_000);
  return h >= 24 ? `${Math.floor(h / 24)}일 남음` : h > 0 ? `${h}시간 남음` : `${Math.floor(ms / 60_000)}분 남음`;
}

export default function HomeScreen() {
  const { me } = useAuth();
  const [drops, setDrops] = useState<Drop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [benefits, setBenefits] = useState<BenefitGroup[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [d, p] = await Promise.all([api<Drop[]>('/drops'), api<Product[]>('/products')]);
    setDrops(d);
    setProducts(p.filter((x) => x.type !== 'PASS').concat(p.filter((x) => x.type === 'PASS')));
    if (me) {
      api<{ merchants: BenefitGroup[] }>('/me/benefits')
        .then((b) => setBenefits(b.merchants))
        .catch(() => setBenefits([]));
    } else setBenefits([]);
  }, [me]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const greetName = me ? `${me.nickname}님` : '홀릭잼';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />
        }
      >
        {/* ① 인사 + 상태 카드 */}
        <View style={st.hero}>
          <View style={st.heroTop}>
            <View>
              <Text style={st.brand}>HOLIC GEM</Text>
              <Text style={st.greet}>
                {me ? `${greetName}, 오늘 부산은 어때요?` : '부산 놀러갈 땐, 홀릭잼 🌊'}
              </Text>
            </View>
          </View>

          <Pressable style={st.statusCard} onPress={() => router.push(me ? '/benefits' : '/(tabs)/my')}>
            {me ? (
              <>
                <View style={st.statusRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.statusPlan}>
                      {me.membership ? `${me.membership.planName} 이용 중` : '멤버십을 시작해 보세요'}
                    </Text>
                    <Text style={st.statusSaving}>
                      이번 달 <Text style={{ color: C.brand, fontWeight: '900' }}>{won(me.savings.thisMonth)}</Text> 아꼈어요
                      {me.savings.recoveryRate != null ? ` · 회수율 ${me.savings.recoveryRate}%` : ''}
                    </Text>
                  </View>
                  {me.membership && <Text style={st.statusBadge}>{me.membership.planName}</Text>}
                </View>
                <View style={st.quickRow}>
                  <Pressable style={st.quick} onPress={() => router.push('/benefits')}>
                    <Ionicons name='gift-outline' size={19} color={C.brand} /><Text style={st.quickLabel}>내 혜택</Text>
                  </Pressable>
                  <View style={st.quickDiv} />
                  <Pressable style={st.quick} onPress={() => router.push('/wallet')}>
                    <Ionicons name='ticket-outline' size={19} color={C.brand} /><Text style={st.quickLabel}>이용권</Text>
                  </Pressable>
                  <View style={st.quickDiv} />
                  <Pressable style={st.quick} onPress={() => router.push('/(tabs)/scan')}>
                    <Ionicons name='qr-code-outline' size={19} color={C.brand} /><Text style={st.quickLabel}>매장 사용</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={st.statusRow}>
                <Text style={[st.statusPlan, { flex: 1 }]}>3초 간편가입하고 오늘 혜택 받기</Text>
                <Text style={st.loginBtn}>시작하기</Text>
              </View>
            )}
          </Pressable>
        </View>

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {drops.slice(0, 6).map((d) => (
            <Pressable key={d.id} style={st.dropCard} onPress={() => router.push(`/drop/${d.id}`)}>
              <View>
                {d.imageUrl ? (
                  <Image source={{ uri: d.imageUrl }} style={st.dropImg} />
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
        </ScrollView>

        {/* ③ 액티비티 예약 */}
        <View style={st.sectionHead}>
          <View>
            <Text style={st.sectionTitle}>바다부터 도심까지 🏄</Text>
            <Text style={st.sectionSub}>결제하면 예약까지 한 번에 끝나요</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
          {CATS.map((c) => (
            <Pressable key={c.code} style={st.cat} onPress={() => router.push('/(tabs)/store')}>
              <View style={st.catCircle}><Text style={{ fontSize: 22 }}>{c.emoji}</Text></View>
              <Text style={st.catLabel}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 12 }}>
          {products.slice(0, 3).map((p) => (
            <Pressable key={p.id} style={st.prodCard} onPress={() => router.push(`/product/${p.id}`)}>
              {p.imageUrl ? (
                <Image source={{ uri: p.imageUrl }} style={st.prodImg} />
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
  hero: { backgroundColor: C.white, paddingTop: 54, paddingBottom: 18, paddingHorizontal: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: 11, fontWeight: '900', letterSpacing: 2.5, color: C.brand },
  greet: { fontSize: 21, fontWeight: '900', color: C.ink, marginTop: 5, letterSpacing: -0.3 },
  statusCard: { backgroundColor: C.ground, borderRadius: 16, padding: 14, marginTop: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusPlan: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  statusSaving: { fontSize: 12.5, color: C.ink2, marginTop: 3 },
  statusBadge: { backgroundColor: C.gold, color: '#fff', fontSize: 11, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  loginBtn: { backgroundColor: C.brand, color: '#fff', fontSize: 13, fontWeight: '800', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
  quickRow: { flexDirection: 'row', marginTop: 12, backgroundColor: C.white, borderRadius: 12, paddingVertical: 10 },
  quick: { flex: 1, alignItems: 'center', gap: 2 },
  quickDiv: { width: 1, backgroundColor: C.line },
  quickIcon: { fontSize: 17 },
  quickLabel: { fontSize: 11.5, fontWeight: '700', color: C.ink2 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, marginTop: 24, marginBottom: 11 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.ink, letterSpacing: -0.3 },
  sectionSub: { fontSize: 12, color: C.ink3, marginTop: 2 },
  more: { fontSize: 12.5, fontWeight: '700', color: C.brand },

  dropCard: { width: 168, backgroundColor: C.white, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  dropImg: { width: '100%', height: 108 },
  dropQty: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(18,24,31,0.78)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  dropQtyText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,24,31,0.45)', alignItems: 'center', justifyContent: 'center' },
  lockEmoji: { fontSize: 26 },
  dropTitle: { fontSize: 13.5, fontWeight: '800', color: C.ink },
  dropMerchant: { fontSize: 11, color: C.ink3, marginTop: 2 },
  dropPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 5 },
  dropRate: { fontSize: 14, fontWeight: '900', color: '#E8503A' },
  dropPrice: { fontSize: 14, fontWeight: '900', color: C.ink },

  cat: { alignItems: 'center', gap: 6 },
  catCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 11.5, fontWeight: '700', color: C.ink2 },

  prodCard: { backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  prodImg: { width: '100%', height: 150 },
  prodBody: { padding: 12 },
  prodName: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  prodMerchant: { fontSize: 12, color: C.ink3, marginTop: 2 },
  prodPrice: { fontSize: 15, fontWeight: '900', color: C.ink },
  prodNormal: { fontSize: 12, color: C.ink3, textDecorationLine: 'line-through' },
  memberTag: { fontSize: 10.5, fontWeight: '900', color: C.gold, backgroundColor: '#F6EBD4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },

  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.white, borderRadius: 13, borderWidth: 1, borderColor: C.line, padding: 10 },
  benefitThumb: { width: 46, height: 46, borderRadius: 10 },
  benefitName: { fontSize: 14, fontWeight: '800', color: C.ink },
  benefitDesc: { fontSize: 12, color: C.ink2, marginTop: 1 },
  benefitRegion: { fontSize: 11.5, color: C.ink3, fontWeight: '600' },
});
