/**
 * 예약·티켓 전체 — 홈 "바다부터 도심까지"의 전체보기.
 * 쿠폰 화면과 같은 패턴: 지역·카테고리 필터 → 사진 카드. (UI/UX 통일, 2026-09-08)
 */
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, img } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { C, won } from '../lib/theme';
import { EmptyText, LoadError, Loading, Screen, Tag } from '../lib/ui';
import { HScroll } from '../lib/hscroll';

type Product = {
  id: string; name: string; imageUrl: string | null; basePrice: number; memberPrice: number | null; type: string;
  isAd?: boolean;
  merchant: { name: string; region: { name: string } };
  category: { name: string; emoji: string | null } | null;
};

function uniq<T>(rows: T[], key: (r: T) => string) {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true)));
}

export default function ProductsScreen() {
  const { t, lang } = useI18n();
  const { me } = useAuth();
  const [rows, setRows] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api<Product[]>('/products').then(setRows).catch(() => setFailed(true));
  }, [lang]);
  useFocusEffect(load);

  if (!rows) {
    return <Screen>{failed ? <LoadError text={t('loadFailed')} retryLabel={t('retry')} onRetry={load} /> : <Loading />}</Screen>;
  }

  const regions = uniq(rows.map((p) => p.merchant.region.name), (x) => x);
  const cats = uniq(rows.filter((p) => p.category).map((p) => p.category!), (x) => x.name);
  const shown = rows.filter(
    (p) => (!region || p.merchant.region.name === region) && (!cat || p.category?.name === cat),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {regions.length > 1 && (
          <HScroll horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 7 }}>
            <Pressable style={[st.tab, region === null && st.tabOn]} onPress={() => setRegion(null)}>
              <Text style={[st.tabText, region === null && st.tabTextOn]}>{t('allRegions')}</Text>
            </Pressable>
            {regions.map((r) => (
              <Pressable key={r} style={[st.tab, region === r && st.tabOn]} onPress={() => setRegion(r)}>
                <Text style={[st.tabText, region === r && st.tabTextOn]}>{r}</Text>
              </Pressable>
            ))}
          </HScroll>
        )}
        {cats.length > 1 && (
          <HScroll horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 7 }}>
            <Pressable style={[st.tab, cat === null && st.tabOn]} onPress={() => setCat(null)}>
              <Text style={[st.tabText, cat === null && st.tabTextOn]}>{t('all')}</Text>
            </Pressable>
            {cats.map((ct) => (
              <Pressable key={ct.name} style={[st.tab, cat === ct.name && st.tabOn]} onPress={() => setCat(ct.name)}>
                <Text style={[st.tabText, cat === ct.name && st.tabTextOn]}>{ct.emoji ?? ''} {ct.name}</Text>
              </Pressable>
            ))}
          </HScroll>
        )}

        {shown.length === 0 && <EmptyText text={t('noMerchants')} />}

        <View style={{ gap: 12 }}>
          {shown.map((p) => (
            <Pressable key={p.id} style={st.card} onPress={() => router.push(`/product/${p.id}` as never)}>
              {p.imageUrl ? (
                <Image source={{ uri: img(p.imageUrl, 640) }} style={st.cardImg} />
              ) : (
                <View style={[st.cardImg, { backgroundColor: C.brandSoft }]} />
              )}
              {p.isAd && <View style={st.adBadge}><Text style={st.adBadgeText}>{t('ad')}</Text></View>}
              <View style={st.cardBody}>
                <Text style={st.cardName} numberOfLines={1}>{p.name}</Text>
                <Text style={st.cardMerchant}>{p.merchant.region.name} · {p.merchant.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  {me?.membership?.isPaid && p.memberPrice != null ? (
                    <>
                      <Tag text={t('memberPrice')} tone="gold" />
                      <Text style={st.cardPrice}>{won(p.memberPrice)}</Text>
                      <Text style={st.cardNormal}>{won(p.basePrice)}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={st.cardPrice}>{won(p.basePrice)}</Text>
                      {p.memberPrice != null && (
                        <Text style={st.cardMemberHint}>{t('memberPriceShort', { price: won(p.memberPrice) })}</Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  tab: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
  },
  tabOn: { backgroundColor: C.brand, borderColor: C.brand },
  tabText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  tabTextOn: { color: '#fff' },
  card: { backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  adBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(18,24,31,0.7)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, zIndex: 1 },
  adBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardImg: { width: '100%', height: 150 },
  cardBody: { padding: 12 },
  cardName: { fontSize: 15.5, fontWeight: '700', color: C.ink },
  cardMerchant: { fontSize: 12, color: C.ink3, marginTop: 2 },
  cardPrice: { fontSize: 15, fontWeight: '700', color: C.ink },
  cardNormal: { fontSize: 12, color: C.ink3, textDecorationLine: 'line-through' },
  cardMemberHint: { fontSize: 11.5, fontWeight: '700', color: C.brand },
});
