/**
 * 기획전 상세 — 배너 + 지자체 지원 안내 + 소속 상품 목록.
 * 상품을 누르면 기존 DROP 상세로 이어져 결제·이용권 발급까지 기존 흐름 그대로.
 */
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { track } from '../../lib/analytics';
import { api, img } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Loading, Screen } from '../../lib/ui';

type CampaignDetail = {
  id: string; title: string; subtitle: string | null; bannerImageUrl: string | null;
  subsidyLabel: string | null; endAt: string | null;
  drops: {
    id: string; title: string; imageUrl: string | null;
    normalPrice: number; dropPrice: number; discountRate: number;
    remainingQty: number; totalQty: number; maxPerUser: number;
    closeAt: string; soldOut: boolean; merchantName: string;
  }[];
};

export default function CampaignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, won, locale, lang } = useI18n();
  const [c, setC] = useState<CampaignDetail | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<CampaignDetail>(`/campaigns/${id}`).then((d) => {
        setC(d);
        track('campaign_view', { type: 'campaign', id: String(id) });
      }).catch(() => {});
    }, [id, lang]),
  );

  if (!c) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* 배너 */}
        <View style={st.hero}>
          {c.bannerImageUrl ? (
            <Image source={{ uri: img(c.bannerImageUrl, 960) }} style={st.heroImg} />
          ) : (
            <View style={[st.heroImg, { backgroundColor: C.brand }]} />
          )}
          <View style={st.heroShade} />
          <View style={st.heroBody}>
            {!!c.subsidyLabel && (
              <View style={st.chip}><Text style={st.chipText}>🏛 {c.subsidyLabel}</Text></View>
            )}
            <Text style={st.heroTitle}>{c.title}</Text>
            {!!c.subtitle && <Text style={st.heroSub}>{c.subtitle}</Text>}
            {!!c.endAt && (
              <Text style={st.heroUntil}>{t('untilDate', { date: new Date(c.endAt).toLocaleDateString(locale) })}</Text>
            )}
          </View>
        </View>

        {/* 지원 안내 */}
        {!!c.subsidyLabel && (
          <View style={st.notice}>
            <Text style={st.noticeText}>💙 {t('subsidyNotice')}</Text>
          </View>
        )}

        {/* 상품 목록 */}
        <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 12 }}>
          {c.drops.map((d) => (
            <Pressable
              key={d.id}
              style={[st.card, d.soldOut && { opacity: 0.55 }]}
              onPress={() => !d.soldOut && router.push(`/drop/${d.id}`)}
            >
              {d.imageUrl ? (
                <Image source={{ uri: img(d.imageUrl, 320) }} style={st.thumb} />
              ) : (
                <View style={[st.thumb, { backgroundColor: C.brandSoft }]} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.cardTitle} numberOfLines={2}>{d.title}</Text>
                <Text style={st.cardMerchant} numberOfLines={1}>{d.merchantName}</Text>
                <View style={st.priceRow}>
                  <Text style={st.rate}>{d.discountRate}%</Text>
                  <Text style={st.price}>{won(d.dropPrice)}</Text>
                  <Text style={st.normal}>{won(d.normalPrice)}</Text>
                </View>
                <View style={st.metaRow}>
                  <View style={st.limitTag}>
                    <Text style={st.limitTagText}>
                      {d.maxPerUser === 1 ? t('onePerPerson') : t('perPersonMax', { n: d.maxPerUser })}
                    </Text>
                  </View>
                  <Text style={[st.qty, d.remainingQty <= 5 && { color: '#E8503A' }]}>
                    {d.soldOut ? t('soldOut') : t('qtyLeft', { n: d.remainingQty })}
                  </Text>
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
  hero: { height: 190, backgroundColor: C.ink },
  heroImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,26,0.45)' },
  heroBody: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  chip: { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  chipText: { fontSize: 11, fontWeight: '700', color: C.brand },
  heroTitle: { color: '#fff', fontSize: 23, fontWeight: '700', letterSpacing: -0.4 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, marginTop: 3 },
  heroUntil: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 5 },
  notice: { backgroundColor: C.brandSoft, paddingHorizontal: 16, paddingVertical: 10 },
  noticeText: { color: C.brand, fontSize: 12.5, fontWeight: '700' },
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: C.white, borderRadius: 15,
    borderWidth: 1, borderColor: C.line, padding: 11, alignItems: 'center',
  },
  thumb: { width: 92, height: 84, borderRadius: 11 },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: C.ink, lineHeight: 19 },
  cardMerchant: { fontSize: 11.5, color: C.ink3, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 5 },
  rate: { fontSize: 15, fontWeight: '700', color: '#E8503A' },
  price: { fontSize: 15, fontWeight: '700', color: C.ink },
  normal: { fontSize: 11.5, color: C.ink3, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  limitTag: { backgroundColor: C.ground, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  limitTagText: { fontSize: 10, fontWeight: '700', color: C.ink2 },
  qty: { fontSize: 11, fontWeight: '700', color: C.brand },
});
