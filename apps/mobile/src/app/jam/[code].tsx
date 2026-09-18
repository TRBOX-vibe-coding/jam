/**
 * 잼 결제 화면 (2026-09-18).
 *
 * 전에는 [시작]을 누르면 브라우저 기본 창(prompt/confirm)이 떴다. 시연에서 확인이 안 된다.
 * 상품 결제와 같은 모양으로 맞춘다 — 무엇이 열리는지 보고, 시작일을 고르고, 아래 고정 바로 결제한다.
 * 결제는 PG 붙기 전까지 모의결제다. 화면에도 그렇게 적는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { track } from '../../lib/analytics';
import { api, img } from '../../lib/api';
import { lastUsableDay } from '../../lib/date';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, Loading, LoadError, Screen, Tag } from '../../lib/ui';

type Sample = {
  id: string; title: string; type: string; value: number;
  merchant: { name: string; thumbnailUrl: string | null; region: string; emoji: string };
};
type Detail = {
  id: string; code: string; name: string; description: string | null;
  price: number; durationDays: number;
  scope: string; scopeRegionIds: string[]; scopeCategoryIds: string[];
  isPrivate: boolean; imageUrl: string | null;
  couponCount: number; merchantCount: number;
  samples: Sample[];
  owned: { startAt: string; endAt: string } | null;
};
type Named = { id: string; name: string };

/** YYYY-MM-DD (기기 시간 기준) */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function JamBuyScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { me, refresh } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const [d, setD] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [regions, setRegions] = useState<Named[]>([]);
  const [cats, setCats] = useState<Named[]>([]);
  const [tripStart, setTripStart] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(ymd(new Date()));
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api<Detail>(`/membership/plans/${code}`).then(setD).catch(() => setFailed(true));
    api<Named[]>('/regions').then(setRegions).catch(() => {});
    api<Named[]>('/categories').then(setCats).catch(() => {});
    // 여행이 있으면 여행 첫날을 기본 시작일로 — 손님이 날짜를 다시 생각할 일을 줄인다
    if (me) {
      api<any>('/me/trip').then((r) => {
        const s = r?.trip?.startDate?.slice(0, 10);
        if (!s) return;
        setTripStart(s);
        if (s >= ymd(new Date())) setStartDate(s);
      }).catch(() => {});
    }
  }, [code, me, lang]);
  useFocusEffect(load);

  function scopeLine(p: Detail) {
    if (p.scope === 'ALL') return t('jamScopeAll');
    if (p.scope === 'MANUAL') return t('jamScopePicked');
    const everyRegion = regions.length > 0 && p.scopeRegionIds.length >= regions.length;
    if (everyRegion && p.scopeCategoryIds.length === 0) return t('jamScopeAll');
    const names = [
      ...p.scopeRegionIds.map((id) => regions.find((r) => r.id === id)?.name),
      ...p.scopeCategoryIds.map((id) => cats.find((c) => c.id === id)?.name),
    ].filter(Boolean) as string[];
    return names.length ? names.join(' · ') : t('jamScopeAll');
  }

  /** 오늘부터 14일 — 달력 대신 칩으로 고른다. 여행 첫날이 그 뒤면 그 날도 끼워 넣는다 */
  const days = (() => {
    const base = Array.from({ length: 14 }, (_, i) => {
      const dt = new Date();
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() + i);
      return ymd(dt);
    });
    if (tripStart && !base.includes(tripStart) && tripStart > base[0]) base.push(tripStart);
    return base.sort();
  })();

  // 고른 날이 화면 밖에 있으면 고른 게 없어 보인다 — 그 자리로 밀어 준다
  const dayList = useRef<ScrollView>(null);
  useEffect(() => {
    const i = days.indexOf(startDate);
    if (i > 1) dayList.current?.scrollTo({ x: (i - 1) * 59, animated: false });
  }, [startDate, tripStart]);

  async function pay() {
    if (!d) return;
    if (!me) { router.push('/(tabs)/my' as never); return; }
    setBusy(true);
    try {
      const r = await api<any>('/membership/purchase', {
        method: 'POST',
        body: { planCode: d.code, startDate: isShort ? startDate : undefined },
      });
      track('membership_purchase', { type: 'plan', id: d.code });
      await refresh();
      router.replace({
        pathname: '/jam/done',
        params: {
          name: r.planName, code: d.code,
          start: new Date(r.startAt).toISOString(),
          end: new Date(r.endAt).toISOString(),
          coupons: String(d.couponCount), merchants: String(d.merchantCount),
          orderNo: r.orderNo,
        },
      } as never);
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message); else Alert.alert(t('cantBuy'), e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) {
    return <Screen>{failed ? <LoadError text={t('loadFailed')} retryLabel={t('retry')} onRetry={load} /> : <Loading />}</Screen>;
  }

  const isShort = d.durationDays <= 30;
  // 3일잼은 3박4일을 덮는다. 끝나는 시각(그 날 0시)이 아니라 마지막으로 쓸 수 있는 날을 보여준다
  const endPreview = (() => {
    const s = new Date(`${startDate}T00:00:00`);
    s.setDate(s.getDate() + (isShort ? d.durationDays + 1 : d.durationDays));
    return lastUsableDay(s);
  })();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {d.imageUrl ? <Image source={{ uri: img(d.imageUrl, 960) }} style={st.hero} /> : null}

        <Card>
          <View style={st.nameRow}>
            <Text style={st.title}>{d.name}</Text>
            {d.isPrivate ? <Tag text={t('orgOnly')} tone="warn" /> : null}
          </View>
          {d.description ? <Text style={st.desc}>{d.description}</Text> : null}
          <View style={st.metaRow}>
            <View style={st.metaChip}>
              <Ionicons name="time-outline" size={13} color={C.ink2} />
              <Text style={st.metaText}>{t('jamDays', { n: d.durationDays })}</Text>
            </View>
            <View style={st.metaChip}>
              <Ionicons name="pricetags-outline" size={13} color={C.ink2} />
              <Text style={st.metaText}>{scopeLine(d)}</Text>
            </View>
          </View>
        </Card>

        {/* 무엇이 열리는지 — 가격보다 이게 먼저다 */}
        <Card>
          <Text style={st.sectionInCard}>{t('jamOpensTitle')}</Text>
          <View style={st.bigRow}>
            <View style={st.bigBox}>
              <Text style={st.bigNum}>{d.couponCount}</Text>
              <Text style={st.bigLabel}>{t('jamOpensCoupons')}</Text>
            </View>
            <View style={st.bigBox}>
              <Text style={st.bigNum}>{d.merchantCount}</Text>
              <Text style={st.bigLabel}>{t('jamOpensMerchants')}</Text>
            </View>
          </View>
          {d.samples.map((s) => (
            <View key={s.id} style={st.sample}>
              {s.merchant.thumbnailUrl
                ? <Image source={{ uri: img(s.merchant.thumbnailUrl, 120) }} style={st.sampleImg} />
                : <View style={[st.sampleImg, st.sampleEmoji]}><Text style={{ fontSize: 17 }}>{s.merchant.emoji}</Text></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.sampleTitle} numberOfLines={1}>{s.title}</Text>
                <Text style={st.sampleSub} numberOfLines={1}>{s.merchant.name} · {s.merchant.region}</Text>
              </View>
            </View>
          ))}
          {d.couponCount > d.samples.length && (
            <Text style={st.moreLine}>{t('jamOpensMore', { n: d.couponCount - d.samples.length })}</Text>
          )}
        </Card>

        {/* 사용 시작일 — 미리 사도 이 날 0시에 열린다 */}
        {isShort && (
          <Card>
            <Text style={st.sectionInCard}>{t('jamStartDate')}</Text>
            <Text style={st.sectionSub}>{t('jamStartPick')}</Text>
            <ScrollView ref={dayList} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
              {days.map((v) => {
                const dt = new Date(`${v}T00:00:00`);
                const on = v === startDate;
                const isTrip = tripStart === v;
                return (
                  <Pressable key={v} style={[st.day, on && st.dayOn]} onPress={() => setStartDate(v)}>
                    <Text style={[st.dayW, on && st.dayTextOn]}>
                      {dt.toLocaleDateString(locale, { weekday: 'short' })}
                    </Text>
                    <Text style={[st.dayD, on && st.dayTextOn]}>{dt.getDate()}</Text>
                    {isTrip ? <Text style={[st.dayTag, on && st.dayTextOn]}>{t('jamTripDay')}</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={st.period}>
              {t('jamPeriod', {
                from: new Date(`${startDate}T00:00:00`).toLocaleDateString(locale),
                to: endPreview.toLocaleDateString(locale),
              })}
            </Text>
          </Card>
        )}

        {/* 결제 — PG 붙기 전까지 모의결제. 숨기지 않고 화면에 적는다 */}
        <Card>
          <Text style={st.sectionInCard}>{t('payMethod')}</Text>
          <View style={st.payRow}>
            <Ionicons name="card-outline" size={18} color={C.brand} />
            <Text style={st.payText}>{t('payMock')}</Text>
          </View>
          <View style={st.sumRow}>
            <Text style={st.sumLabel}>{t('payAmount')}</Text>
            <Text style={st.sumValue}>{won(d.price)}</Text>
          </View>
        </Card>

        <Text style={st.foot}>{t('jamBuyFoot')}</Text>
      </ScrollView>

      {/* 하단 고정 결제바 — 상품 결제와 같은 자리 */}
      <View style={st.bar}>
        <View style={{ flex: 1 }}>
          <Text style={st.barLabel}>{d.name}</Text>
          <Text style={st.barPrice}>{won(d.price)}</Text>
        </View>
        {d.owned ? (
          <Tag text={t('usableNow')} tone="gold" />
        ) : (
          <View style={{ minWidth: 148 }}>
            <Btn title={t('payTotal', { price: won(d.price) })} onPress={pay} disabled={busy} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { width: '100%', height: 160, borderRadius: 14, marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  title: { fontSize: 21, fontWeight: '800', color: C.ink },
  desc: { fontSize: 13.5, color: C.ink2, marginTop: 5, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.ground, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
  },
  metaText: { fontSize: 11.5, fontWeight: '700', color: C.ink2 },

  sectionInCard: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  sectionSub: { fontSize: 12.5, color: C.ink3, marginTop: 3, marginBottom: 10, lineHeight: 18 },

  bigRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4 },
  bigBox: { flex: 1, backgroundColor: C.brandSoft, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  bigNum: { fontSize: 24, fontWeight: '800', color: C.brand, letterSpacing: -0.5 },
  bigLabel: { fontSize: 11.5, fontWeight: '700', color: C.ink2, marginTop: 1 },

  sample: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  sampleImg: { width: 38, height: 38, borderRadius: 9, backgroundColor: C.ground },
  sampleEmoji: { alignItems: 'center', justifyContent: 'center' },
  sampleTitle: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  sampleSub: { fontSize: 11.5, color: C.ink3, marginTop: 1 },
  moreLine: { fontSize: 12, color: C.ink3, marginTop: 10 },

  day: {
    minWidth: 52, alignItems: 'center', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 6,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.white,
  },
  dayOn: { backgroundColor: C.brand, borderColor: C.brand },
  dayW: { fontSize: 11, fontWeight: '700', color: C.ink3 },
  dayD: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 1 },
  dayTag: { fontSize: 9.5, fontWeight: '800', color: C.brand, marginTop: 1 },
  dayTextOn: { color: '#fff' },
  period: { fontSize: 12.5, color: C.ink2, marginTop: 11, fontWeight: '600' },

  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  payText: { fontSize: 13, color: C.ink2, flex: 1, lineHeight: 19 },
  sumRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line,
  },
  sumLabel: { fontSize: 13.5, fontWeight: '700', color: C.ink2 },
  sumValue: { fontSize: 20, fontWeight: '800', color: C.brand },

  foot: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 16, lineHeight: 17 },

  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line,
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 16,
  },
  barLabel: { fontSize: 12, color: C.ink3, fontWeight: '700' },
  barPrice: { fontSize: 19, fontWeight: '800', color: C.ink, marginTop: 1 },
});
