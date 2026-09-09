/** 담은 목록 — 찜해둔 쿠폰·상품을 한 곳에서. 추후 여행 계획 기능의 기초 화면. */
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, img } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { C, won } from '../lib/theme';
import { Btn, EmptyText, LoadError, Loading, Screen, Tag } from '../lib/ui';
import { couponValue } from '../lib/coupons';

type SavedBenefit = {
  refId: string; userBenefitId: string | null; title: string; type: string; value: number; isActive: boolean;
  estimatedSaving: number | null;
  merchant: { id: string; name: string; thumbnailUrl: string | null; region: string; categoryEmoji: string };
};
type SavedProduct = {
  refId: string; name: string; imageUrl: string | null; basePrice: number; memberPrice: number | null;
  type: string; isActive: boolean; estimatedSaving: number;
  merchant: { id: string; name: string; region: string };
};
type TripInfo = { days: number; items: { itemType: string; refId: string; dayIndex: number }[] };

export default function SavedScreen() {
  const { me } = useAuth();
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ benefits: SavedBenefit[]; products: SavedProduct[] } | null>(null);
  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api<{ benefits: SavedBenefit[]; products: SavedProduct[] }>('/me/saves')
      .then(setData)
      .catch(() => setFailed(true));
    api<{ trip: TripInfo | null }>('/me/trip').then((r) => setTrip(r.trip)).catch(() => {});
  }, [lang]);
  useFocusEffect(load);

  /** 담은 항목을 여행의 Day에 놓기 (이미 그 Day면 해제) */
  async function placeDay(itemType: 'BENEFIT' | 'PRODUCT', refId: string, dayIndex: number) {
    const cur = trip?.items.find((i) => i.itemType === itemType && i.refId === refId);
    const next = cur?.dayIndex === dayIndex ? undefined : dayIndex; // 같은 Day 다시 누르면 빼기
    await api('/me/trip/items', { method: 'POST', body: { itemType, refId, dayIndex: next } }).catch(() => {});
    load();
  }

  function DayChips({ itemType, refId }: { itemType: 'BENEFIT' | 'PRODUCT'; refId: string }) {
    if (!trip) return null;
    const cur = trip.items.find((i) => i.itemType === itemType && i.refId === refId);
    return (
      <View style={st.dayRow}>
        {Array.from({ length: trip.days }).map((_, di) => (
          <Pressable
            key={di}
            style={[st.dayChip, cur?.dayIndex === di && st.dayChipOn]}
            onPress={() => placeDay(itemType, refId, di)}
          >
            <Text style={[st.dayChipText, cur?.dayIndex === di && st.dayChipTextOn]}>Day {di + 1}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  async function unsave(itemType: 'BENEFIT' | 'PRODUCT', refId: string) {
    setData((d) => d && ({
      benefits: itemType === 'BENEFIT' ? d.benefits.filter((b) => b.refId !== refId) : d.benefits,
      products: itemType === 'PRODUCT' ? d.products.filter((p) => p.refId !== refId) : d.products,
    }));
    try { await api('/me/saves', { method: 'POST', body: { itemType, refId } }); } catch { load(); }
  }

  if (!me) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <EmptyText text={t('benefitsLoginEmpty')} />
          <Btn title={t('goLogin')} onPress={() => router.push('/(tabs)/my')} />
        </View>
      </Screen>
    );
  }
  if (!data) {
    return <Screen>{failed ? <LoadError text={t('loadFailed')} retryLabel={t('retry')} onRetry={load} /> : <Loading />}</Screen>;
  }

  const empty = data.benefits.length === 0 && data.products.length === 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {empty && (
          <View style={{ paddingTop: 40 }}>
            <EmptyText text={t('savedEmpty')} />
            <Btn title={t('more')} onPress={() => router.push('/(tabs)/store')} />
          </View>
        )}

        {data.benefits.length > 0 && (
          <>
            <Text style={st.section}>{t('savedCoupons')} ({data.benefits.length})</Text>
            {data.benefits.map((b) => (
              <View key={b.refId} style={st.row2}>
                <Pressable style={st.rowInner} onPress={() => router.push(`/store/${b.merchant.id}` as never)}>
                  {b.merchant.thumbnailUrl ? (
                    <Image source={{ uri: img(b.merchant.thumbnailUrl, 240) }} style={st.thumb} />
                  ) : (
                    <View style={[st.thumb, st.thumbEmpty]}><Text>{b.merchant.categoryEmoji}</Text></View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.value}>
                      {b.estimatedSaving != null ? `${t('savedLabelTrip')} ${won(b.estimatedSaving)}` : `${couponValue(b) ?? t('freeLabel')} +α`}
                    </Text>
                    <Text style={st.title} numberOfLines={1}>{b.title}</Text>
                    <Text style={st.sub} numberOfLines={1}>{b.merchant.name} · {b.merchant.region}</Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => unsave('BENEFIT', b.refId)}>
                    <Ionicons name="heart" size={22} color="#E8503A" />
                  </Pressable>
                </Pressable>
                <DayChips itemType="BENEFIT" refId={b.refId} />
              </View>
            ))}
          </>
        )}

        {data.products.length > 0 && (
          <>
            <Text style={[st.section, data.benefits.length > 0 && { marginTop: 18 }]}>{t('savedProducts')} ({data.products.length})</Text>
            {data.products.map((p) => (
              <View key={p.refId} style={st.row2}>
                <Pressable style={st.rowInner} onPress={() => router.push(`/product/${p.refId}` as never)}>
                  {p.imageUrl ? (
                    <Image source={{ uri: img(p.imageUrl, 240) }} style={st.thumb} />
                  ) : (
                    <View style={[st.thumb, st.thumbEmpty]}><Text>🎫</Text></View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {p.estimatedSaving > 0 && (
                      <Text style={st.value}>{t('savedLabelTrip')} {won(p.estimatedSaving)}</Text>
                    )}
                    <Text style={st.title} numberOfLines={1}>{p.name}</Text>
                    <Text style={st.sub} numberOfLines={1}>{p.merchant.name} · {p.merchant.region}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {p.memberPrice != null ? (
                        <>
                          <Tag text={t('memberPrice')} tone="gold" />
                          <Text style={st.price}>{won(p.memberPrice)}</Text>
                        </>
                      ) : (
                        <Text style={st.price}>{won(p.basePrice)}</Text>
                      )}
                    </View>
                  </View>
                  <Pressable hitSlop={10} onPress={() => unsave('PRODUCT', p.refId)}>
                    <Ionicons name="heart" size={22} color="#E8503A" />
                  </Pressable>
                </Pressable>
                <DayChips itemType="PRODUCT" refId={p.refId} />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line,
    padding: 12, marginBottom: 8,
  },
  row2: {
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line,
    padding: 12, marginBottom: 8,
  },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  dayChip: {
    borderWidth: 1, borderColor: C.line, borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 5, backgroundColor: C.ground,
  },
  dayChipOn: { backgroundColor: C.brand, borderColor: C.brand },
  dayChipText: { fontSize: 11.5, fontWeight: '700', color: C.ink2 },
  dayChipTextOn: { color: '#fff' },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  thumbEmpty: { backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 13, fontWeight: '800', color: '#E8503A' },
  title: { fontSize: 14.5, fontWeight: '700', color: C.ink, marginTop: 1 },
  sub: { fontSize: 12, color: C.ink3, marginTop: 1 },
  price: { fontSize: 14, fontWeight: '700', color: C.ink },
});
