/**
 * 매장 상세 — 이 매장의 상시 혜택(기존 서비스) + 진행 중 DROP + 예약 상품을 한 화면에.
 */
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { C, won } from '../../lib/theme';
import { Btn, Card, Loading, Screen, Tag } from '../../lib/ui';

export default function StoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const [m, setM] = useState<any | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<any>(`/merchants/${id}`).then(setM).catch(() => {});
    }, [id]),
  );

  if (!m) return <Screen><Loading /></Screen>;
  const isMember = !!me?.membership;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {m.thumbnailUrl && <Image source={{ uri: img(m.thumbnailUrl, 960) }} style={st.hero} />}

        <Card>
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 7 }}>
            <Tag text={`${m.category.emoji} ${m.category.name}`} />
            <Tag text={m.region.name} tone="ok" />
          </View>
          <Text style={st.name}>{m.name}</Text>
          {m.intro && <Text style={st.intro}>{m.intro}</Text>}
          {m.address && <Text style={st.addr}>📍 {m.address}</Text>}
        </Card>

        {/* 상시 혜택 — 기존 홀릭잼 서비스 */}
        <Text style={st.section}>멤버십 상시 혜택</Text>
        {m.benefits.length === 0 && (
          <Card><Text style={st.emptyLine}>등록된 상시 혜택이 없습니다</Text></Card>
        )}
        {m.benefits.map((b: any) => (
          <Card key={b.id}>
            <Text style={st.benefitTitle}>{b.title}</Text>
            <Text style={st.benefitCond}>
              {b.companionLimit == null ? '동반 인원 제한 없음' : `동반 ${b.companionLimit}인까지`}
              {b.maxUsePerDay ? ` · 하루 ${b.maxUsePerDay}회` : ''}
              {b.conditions ? ` · ${b.conditions}` : ''}
            </Text>
            {isMember ? (
              <View style={{ marginTop: 9 }}>
                <Btn title="매장에서 사용하기" small onPress={() => router.push('/(tabs)/scan')} />
              </View>
            ) : (
              <Pressable style={st.lockBar} onPress={() => router.push('/(tabs)/my')}>
                <Text style={st.lockText}>🔒 멤버십을 시작하면 바로 사용할 수 있어요 →</Text>
              </Pressable>
            )}
          </Card>
        ))}

        {/* 진행 중 DROP */}
        {m.drops.length > 0 && (
          <>
            <Text style={st.section}>진행 중 DROP</Text>
            {m.drops.map((d: any) => (
              <Pressable key={d.id} onPress={() => router.push(`/drop/${d.id}`)}>
                <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {d.imageUrl && <Image source={{ uri: img(d.imageUrl, 160) }} style={st.dropThumb} />}
                  <View style={{ flex: 1 }}>
                    <Text style={st.dropTitle} numberOfLines={1}>{d.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <Text style={st.dropRate}>{Math.round((1 - d.dropPrice / d.normalPrice) * 100)}%</Text>
                      <Text style={st.dropPrice}>{won(d.dropPrice)}</Text>
                      <Text style={st.dropQty}>{d.remainingQty}개 남음</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}

        {/* 예약 상품 */}
        {m.products.length > 0 && (
          <>
            <Text style={st.section}>예약 · 이용권</Text>
            {m.products.map((p: any) => (
              <Pressable key={p.id} onPress={() => router.push(`/product/${p.id}`)}>
                <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {p.imageUrl && <Image source={{ uri: img(p.imageUrl, 160) }} style={st.dropThumb} />}
                  <View style={{ flex: 1 }}>
                    <Text style={st.dropTitle} numberOfLines={1}>{p.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {p.memberPrice != null && <Tag text="멤버십가" tone="gold" />}
                      <Text style={st.dropPrice}>{won(p.memberPrice ?? p.basePrice)}</Text>
                      {p.memberPrice != null && <Text style={st.normal}>{won(p.basePrice)}</Text>}
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { width: '100%', height: 180, borderRadius: 16, marginBottom: 12 },
  name: { fontSize: 21, fontWeight: '700', color: C.ink },
  intro: { fontSize: 13.5, color: C.ink2, marginTop: 4 },
  addr: { fontSize: 12, color: C.ink3, marginTop: 8 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 12, marginBottom: 8 },
  emptyLine: { fontSize: 13, color: C.ink3, textAlign: 'center' },
  benefitTitle: { fontSize: 15.5, fontWeight: '700', color: C.ink },
  benefitCond: { fontSize: 12, color: C.ink3, marginTop: 3 },
  lockBar: { marginTop: 9, backgroundColor: C.ground, borderRadius: 9, padding: 9 },
  lockText: { fontSize: 12.5, fontWeight: '700', color: C.ink2, textAlign: 'center' },
  dropThumb: { width: 62, height: 62, borderRadius: 10 },
  dropTitle: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  dropRate: { fontSize: 14, fontWeight: '700', color: '#E8503A' },
  dropPrice: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  dropQty: { fontSize: 11.5, fontWeight: '700', color: C.brand, marginLeft: 'auto' },
  normal: { fontSize: 12, color: C.ink3, textDecorationLine: 'line-through' },
});
