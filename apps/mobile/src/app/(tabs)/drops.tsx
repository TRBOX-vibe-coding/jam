/**
 * DROP 탭 — 라스트오더 스타일: 큰 사진 + 빨간 할인% + 남은 수량 + 마감 타이머.
 */
import { useCallback, useState } from 'react';
import {
  FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, img } from '../../lib/api';
import { C, won } from '../../lib/theme';
import { Chip, EmptyText, Loading, Screen, Tag } from '../../lib/ui';
import { HScroll } from '../../lib/hscroll';

type Region = { id: string; name: string };
type Drop = {
  id: string; kind: 'DEAL' | 'TICKET'; title: string; imageUrl: string | null;
  merchant: { name: string }; region: { name: string }; category: { name: string; emoji: string };
  normalPrice: number; dropPrice: number; discountRate: number;
  remainingQty: number; totalQty: number; personsPerUnit: number;
  closeAt: string; isSponsored: boolean; memberOnly: boolean; locked: boolean; preOpen: boolean;
};

function timeLeft(closeAt: string): string {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return '마감';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}일 남음`;
  if (h > 0) return `${h}시간 ${m}분 남음`;
  return `${m}분 남음`;
}

export default function DropsScreen() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [rs, ds] = await Promise.all([
      api<Region[]>('/regions'),
      api<Drop[]>(`/drops${regionId ? `?regionId=${regionId}` : ''}`),
    ]);
    setRegions(rs);
    setDrops(ds);
  }, [regionId]);

  useFocusEffect(useCallback(() => { load().catch(() => setDrops([])); }, [load]));

  return (
    <Screen>
      <View style={{ paddingVertical: 10, backgroundColor: C.white }}>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16 }}>
          <Chip label="전체" active={!regionId} onPress={() => setRegionId(null)} />
          {regions.map((r) => (
            <Chip key={r.id} label={r.name} active={regionId === r.id} onPress={() => setRegionId(r.id)} />
          ))}
        </HScroll>
      </View>

      {!drops ? (
        <Loading />
      ) : (
        <FlatList
          data={drops}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />
          }
          ListEmptyComponent={<EmptyText text="이 지역에는 아직 오픈된 DROP이 없어요" />}
          renderItem={({ item: d }) => (
            <Pressable onPress={() => router.push(`/drop/${d.id}`)} style={st.card}>
              <View>
                {d.imageUrl ? (
                  <Image source={{ uri: img(d.imageUrl, 480) }} style={st.img} />
                ) : (
                  <View style={[st.img, { backgroundColor: C.brandSoft }]} />
                )}
                {/* 이미지 위 오버레이 */}
                <View style={st.overlayTop}>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <View style={st.regionTag}><Text style={st.regionTagText}>{d.category.emoji} {d.region.name}</Text></View>
                    {d.isSponsored && <View style={st.adTag}><Text style={st.adTagText}>광고</Text></View>}
                  </View>
                  <View style={st.timerTag}><Text style={st.timerText}>⏰ {timeLeft(d.closeAt)}</Text></View>
                </View>
                <View style={st.overlayBottom}>
                  <View style={[st.qtyTag, d.remainingQty <= 5 && { backgroundColor: '#E8503A' }]}>
                    <Text style={st.qtyText}>{d.remainingQty}개 남음</Text>
                  </View>
                  {d.personsPerUnit > 1 && (
                    <View style={st.personTag}><Text style={st.personText}>1개={d.personsPerUnit}인</Text></View>
                  )}
                </View>
                {d.locked && (
                  <View style={st.lockOverlay}>
                    <Text style={{ fontSize: 30 }}>🔒</Text>
                    <Text style={st.lockText}>멤버십 전용</Text>
                  </View>
                )}
              </View>

              <View style={st.body}>
                <Text style={st.title} numberOfLines={1}>{d.title}</Text>
                <Text style={st.merchant}>{d.merchant.name}</Text>
                <View style={st.priceRow}>
                  <Text style={st.rate}>{d.discountRate}%</Text>
                  <Text style={st.price}>{won(d.dropPrice)}</Text>
                  <Text style={st.normal}>{won(d.normalPrice)}</Text>
                  {d.memberOnly && <View style={{ marginLeft: 'auto' }}><Tag text="멤버 전용" tone="gold" /></View>}
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
  card: { backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line, marginBottom: 14 },
  img: { width: '100%', height: 176 },
  overlayTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' },
  regionTag: { backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  regionTagText: { fontSize: 11, fontWeight: '700', color: C.ink },
  adTag: { backgroundColor: 'rgba(18,24,31,0.6)', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  adTagText: { fontSize: 10.5, fontWeight: '700', color: '#fff' },
  timerTag: { backgroundColor: 'rgba(232,80,58,0.95)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  timerText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  overlayBottom: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', gap: 6 },
  qtyTag: { backgroundColor: 'rgba(18,24,31,0.78)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  qtyText: { fontSize: 11.5, fontWeight: '700', color: '#fff' },
  personTag: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  personText: { fontSize: 10.5, fontWeight: '700', color: C.ink2 },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,24,31,0.5)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  lockText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  body: { padding: 13 },
  title: { fontSize: 16.5, fontWeight: '700', color: C.ink, letterSpacing: -0.2 },
  merchant: { fontSize: 12.5, color: C.ink3, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  rate: { fontSize: 19, fontWeight: '700', color: '#E8503A' },
  price: { fontSize: 18, fontWeight: '700', color: C.ink },
  normal: { fontSize: 13, color: C.ink3, textDecorationLine: 'line-through' },
});
