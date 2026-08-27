/**
 * 오늘의 DROP — 첫 화면.
 * "오늘 내 주변에 뭐가 떴는지"가 앱을 켜자마자 보인다.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { C, won } from '../../lib/theme';
import { Card, Chip, EmptyText, Loading, Screen, Tag } from '../../lib/ui';

type Region = { id: string; name: string };
type Drop = {
  id: string; kind: 'DEAL' | 'TICKET'; title: string;
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

export default function TodayScreen() {
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

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setDrops([]));
    }, [load]),
  );

  return (
    <Screen>
      <View style={{ paddingVertical: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <Chip label="전체" active={!regionId} onPress={() => setRegionId(null)} />
          {regions.map((r) => (
            <Chip key={r.id} label={r.name} active={regionId === r.id} onPress={() => setRegionId(r.id)} />
          ))}
        </ScrollView>
      </View>

      {!drops ? (
        <Loading />
      ) : (
        <FlatList
          data={drops}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load().catch(() => {});
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={<EmptyText text="이 지역에는 아직 오픈된 DROP이 없어요" />}
          renderItem={({ item: d }) => (
            <Pressable onPress={() => router.push(`/drop/${d.id}`)}>
              <Card>
                <View style={st.rowBetween}>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <Tag text={`${d.category.emoji} ${d.region.name}`} tone="brand" />
                    {d.memberOnly && <Tag text="멤버 전용" tone="gold" />}
                    {d.isSponsored && <Tag text="광고" tone="warn" />}
                  </View>
                  <Text style={st.timer}>{timeLeft(d.closeAt)}</Text>
                </View>

                <Text style={st.title} numberOfLines={2}>{d.title}</Text>
                <Text style={st.merchant}>{d.merchant.name}</Text>

                <View style={[st.rowBetween, { marginTop: 10, alignItems: 'flex-end' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text style={st.rate}>{d.discountRate}%</Text>
                    <Text style={st.price}>{won(d.dropPrice)}</Text>
                    <Text style={st.normal}>{won(d.normalPrice)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.qty, d.remainingQty <= 3 && { color: C.bad }]}>
                      {d.remainingQty}개 남음
                    </Text>
                    {d.personsPerUnit > 1 && (
                      <Text style={st.persons}>1개 = {d.personsPerUnit}인</Text>
                    )}
                  </View>
                </View>

                {d.locked && (
                  <View style={st.lockBar}>
                    <Text style={st.lockText}>🔒 멤버십 회원만 받을 수 있어요</Text>
                  </View>
                )}
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timer: { fontSize: 12, color: C.bad, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 8, lineHeight: 22 },
  merchant: { fontSize: 13, color: C.ink3, marginTop: 2 },
  rate: { fontSize: 18, fontWeight: '900', color: C.bad },
  price: { fontSize: 17, fontWeight: '800', color: C.ink },
  normal: { fontSize: 13, color: C.ink3, textDecorationLine: 'line-through' },
  qty: { fontSize: 13, fontWeight: '800', color: C.brand },
  persons: { fontSize: 11, color: C.ink3 },
  lockBar: { marginTop: 10, backgroundColor: C.ground, borderRadius: 8, padding: 8 },
  lockText: { fontSize: 12, color: C.ink2, fontWeight: '600', textAlign: 'center' },
});
