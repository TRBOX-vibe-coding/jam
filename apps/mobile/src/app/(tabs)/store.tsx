/**
 * 혜택 탭 — 기존 홀릭잼의 본체(제휴 매장 쿠폰북) 복원.
 * 비로그인/비멤버도 전 제휴처와 혜택을 둘러볼 수 있다 → 멤버십을 살 이유가 보인다.
 * 제안서 MEMBERSHIP 레이어: "상시 제휴 할인 + 회원 전용가 + 선오픈".
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Chip, EmptyText, Loading, Screen } from '../../lib/ui';
import { HScroll } from '../../lib/hscroll';

type Region = { id: string; name: string };
type Category = { id: string; code: string; name: string; emoji: string };
type Merchant = {
  id: string; name: string; intro: string | null; thumbnailUrl: string | null;
  region: { name: string }; category: { name: string; emoji: string };
  benefits: { id: string; title: string; companionLimit: number | null }[];
  productCount: number; openDropCount: number;
};

export default function StoreScreen() {
  const { me } = useAuth();
  const { t, lang } = useI18n();
  const [regions, setRegions] = useState<Region[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [rows, setRows] = useState<Merchant[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (regionId) q.set('regionId', regionId);
    if (categoryId) q.set('categoryId', categoryId);
    const [rs, cs, ms] = await Promise.all([
      api<Region[]>('/regions'),
      api<Category[]>('/categories'),
      api<Merchant[]>(`/merchants${q.toString() ? `?${q}` : ''}`),
    ]);
    setRegions(rs);
    setCategories(cs);
    setRows(ms);
  }, [regionId, categoryId, lang]);

  useEffect(() => { load().catch(() => setRows([])); }, [load]);

  const isMember = !!me?.membership;

  return (
    <Screen>
      {/* 멤버십 안내 배너 — 비멤버에게 "왜 사야 하는지" */}
      {!isMember && (
        <Pressable style={st.banner} onPress={() => router.push('/(tabs)/my')}>
          <Text style={st.bannerText}>{t('bannerAll')}</Text>
          <Text style={st.bannerCta}>{t('bannerCta')}</Text>
        </Pressable>
      )}

      <View style={{ backgroundColor: C.white, paddingBottom: 10 }}>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Chip label={t('allRegions')} active={!regionId} onPress={() => setRegionId(null)} />
          {regions.map((r) => (
            <Chip key={r.id} label={r.name} active={regionId === r.id} onPress={() => setRegionId(r.id)} />
          ))}
        </HScroll>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Chip label={t('all')} active={!categoryId} onPress={() => setCategoryId(null)} />
          {categories.map((c) => (
            <Chip key={c.id} label={`${c.emoji} ${c.name}`} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </HScroll>
      </View>

      {!rows ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />
          }
          ListEmptyComponent={<EmptyText text={t('noMerchants')} />}
          renderItem={({ item: m }) => (
            <Pressable style={st.card} onPress={() => router.push(`/store/${m.id}`)}>
              {m.thumbnailUrl ? (
                <Image source={{ uri: img(m.thumbnailUrl, 160) }} style={st.thumb} />
              ) : (
                <View style={[st.thumb, st.thumbFallback]}>
                  <Text style={{ fontSize: 24 }}>{m.category.emoji}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={st.rowTop}>
                  <Text style={st.name} numberOfLines={1}>{m.name}</Text>
                  <Text style={st.region}>{m.region.name}</Text>
                </View>
                <Text style={st.intro} numberOfLines={1}>{m.intro ?? m.category.name}</Text>
                {m.benefits.slice(0, 2).map((b) => (
                  <View key={b.id} style={st.benefitLine}>
                    <View style={[st.benefitDot, !isMember && { backgroundColor: C.ink3 }]} />
                    <Text style={[st.benefitText, !isMember && { color: C.ink3 }]} numberOfLines={1}>
                      {b.title}
                    </Text>
                  </View>
                ))}
                <View style={st.metaRow}>
                  {m.openDropCount > 0 && (
                    <Text style={st.metaDrop}>{t('metaDrop', { n: m.openDropCount })}</Text>
                  )}
                  {m.productCount > 0 && (
                    <Text style={st.metaProduct}>{t('metaProduct', { n: m.productCount })}</Text>
                  )}
                  {!isMember && m.benefits.length > 0 && (
                    <Text style={st.metaLock}>{t('lockedForMember')}</Text>
                  )}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  banner: {
    backgroundColor: C.brand, paddingHorizontal: 16, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  bannerText: { color: '#DCE9F5', fontSize: 13, fontWeight: '600', flex: 1 },
  bannerCta: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: C.white, borderRadius: 15,
    borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 10,
  },
  thumb: { width: 74, height: 74, borderRadius: 12 },
  thumbFallback: { backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15.5, fontWeight: '700', color: C.ink, flexShrink: 1 },
  region: { fontSize: 11.5, color: C.ink3, fontWeight: '600', marginLeft: 'auto' },
  intro: { fontSize: 12, color: C.ink3, marginTop: 1, marginBottom: 6 },
  benefitLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  benefitDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.ok },
  benefitText: { fontSize: 12.5, fontWeight: '700', color: C.ink2, flex: 1 },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 5, alignItems: 'center' },
  metaDrop: {
    fontSize: 10.5, fontWeight: '700', color: '#E8503A',
    backgroundColor: '#FBE9E6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  metaProduct: {
    fontSize: 10.5, fontWeight: '700', color: C.brand,
    backgroundColor: C.brandSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  metaLock: { fontSize: 10.5, color: C.ink3, marginLeft: 'auto' },
});
