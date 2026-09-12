/**
 * 일정 탭 — 홀릭잼의 킥. (2026-09-09 대표 픽스)
 * 여행 만들기(시작일·종료일·인원) → 기간이 잼을 추천 → 담은 항목을 Day에 배치 →
 * 예상 절약액과 잼 가격 대비 배수를 시각화한다. 무료 유저도 전부 가능 = 맛보기잼.
 */
import { createElement, useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { C, won } from '../../lib/theme';
import { Btn, Card, EmptyText, LoadError, Loading, Screen } from '../../lib/ui';

function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('', msg);
}

type TripItemT = {
  itemType: 'BENEFIT' | 'PRODUCT'; refId: string; dayIndex: number;
  title: string; saving: number | null; imageUrl?: string | null;
  benefitType?: string; value?: number;
  merchant: { id: string; name: string; thumbnailUrl: string | null; region: string; emoji: string };
};
type TripT = {
  startDate: string; endDate: string; headcount: number; days: number;
  totalSaving: number; hasPlusAlpha: boolean;
  recommendedPlan: { code: string; name: string; price: number } | null;
  multiple: number | null; grade: 'GREAT' | 'GOOD' | 'START' | null;
  items: TripItemT[];
};

const GRADE_COLOR: Record<string, string> = { GREAT: '#7CF2B0', GOOD: '#9ED2FF', START: '#FFD983' };
const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 날짜 입력 — 웹에서는 브라우저 기본 달력(<input type="date">)을 띄우고,
 * 네이티브에서는 YYYY-MM-DD 텍스트 입력으로 받는다. (앱 빌드 단계에서 네이티브 달력으로 교체)
 */
function DateField({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date', value, min,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        flex: 1, minWidth: 0, height: 44, borderRadius: 11, border: `1px solid ${C.line}`,
        background: C.ground, color: C.ink, fontSize: 15, fontWeight: 700, textAlign: 'center',
        fontFamily: 'inherit', padding: '0 8px',
      },
    });
  }
  return (
    <TextInput style={[st.input, { flex: 1 }]} value={value} onChangeText={onChange} placeholder="2026-10-01" placeholderTextColor={C.ink3} keyboardType="numbers-and-punctuation" />
  );
}

export default function TripScreen() {
  const { me } = useAuth();
  const { t, locale, lang } = useI18n();
  const [data, setData] = useState<{ trip: TripT | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  // 만들기 폼
  const today = new Date();
  const [start, setStart] = useState(dstr(new Date(today.getTime() + 3 * 86400_000)));
  const [end, setEnd] = useState(dstr(new Date(today.getTime() + 6 * 86400_000)));
  const [headcount, setHeadcount] = useState(2);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api<{ trip: TripT | null }>('/me/trip').then(setData).catch(() => setFailed(true));
  }, [lang]);
  useFocusEffect(load);

  const days = (() => {
    const s = new Date(start); const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
    return Math.round((e.getTime() - s.getTime()) / 86400_000) + 1;
  })();
  const recPlan = days == null ? null : days <= 4 ? t('jam3Name') : days <= 6 ? t('jam5Name') : t('jamMasterName');

  async function createTrip() {
    setBusy(true);
    try {
      await api('/me/trip', { method: 'POST', body: { startDate: start, endDate: end, headcount } });
      setEditing(false);
      load();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(it: TripItemT) {
    await api('/me/trip/items', { method: 'POST', body: { itemType: it.itemType, refId: it.refId } }).catch(() => {});
    load();
  }

  if (!me) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <EmptyText text={t('tripLoginEmpty')} />
          <Btn title={t('goLogin')} onPress={() => router.push('/(tabs)/my')} />
        </View>
      </Screen>
    );
  }
  if (!data) {
    return <Screen>{failed ? <LoadError text={t('loadFailed')} retryLabel={t('retry')} onRetry={load} /> : <Loading />}</Screen>;
  }

  const trip = data.trip;

  // ── 여행 없음 or 수정 모드: 만들기 폼 ──
  if (!trip || editing) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card>
            <Text style={st.formTitle}>{t('tripWhen')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <DateField value={start} onChange={setStart} min={dstr(today)} />
              <Text style={{ color: C.ink3 }}>~</Text>
              <DateField value={end} onChange={setEnd} min={start} />
            </View>
            <Text style={st.formTitle}>{t('tripWho')}</Text>
            <View style={st.stepper}>
              <Pressable hitSlop={8} onPress={() => setHeadcount((h) => Math.max(1, h - 1))}><Text style={st.stepBtn}>−</Text></Pressable>
              <Text style={st.headcount}>{t('people', { n: headcount })}</Text>
              <Pressable hitSlop={8} onPress={() => setHeadcount((h) => Math.min(20, h + 1))}><Text style={st.stepBtn}>＋</Text></Pressable>
            </View>
            {days != null && recPlan && (
              <View style={st.recBox}>
                <Text style={st.recText}>✨ {t('tripRecommend', { days: `${days - 1}`, plan: recPlan })}</Text>
              </View>
            )}
            <Btn title={busy ? '…' : trip ? t('confirm') : t('tripCreate')} onPress={createTrip} disabled={busy || days == null} />
            {editing && (
              <Pressable onPress={() => setEditing(false)} style={{ marginTop: 10 }}>
                <Text style={st.cancelText}>{t('close')}</Text>
              </Pressable>
            )}
          </Card>
          <Text style={st.hint}>{t('tripFormHint')}</Text>
        </ScrollView>
      </Screen>
    );
  }

  // ── 내 여행 ──
  const range = `${new Date(trip.startDate).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })} ~ ${new Date(trip.endDate).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })}`;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* 절약 히어로 */}
        <Card style={{ backgroundColor: C.brand, borderColor: C.brand }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={st.heroSub}>{t('tripHeroTitle', { nights: `${trip.days - 1}`, days: `${trip.days}`, n: trip.headcount })}</Text>
            <Pressable hitSlop={8} onPress={() => { setStart(trip.startDate.slice(0, 10)); setEnd(trip.endDate.slice(0, 10)); setHeadcount(trip.headcount); setEditing(true); }}>
              <Text style={st.heroEdit}>{t('tripEdit')}</Text>
            </Pressable>
          </View>
          <Text style={st.heroSub2}>{range} · {t('savedLabelTrip')}</Text>
          <Text style={st.heroValue}>
            {won(trip.totalSaving)}{trip.hasPlusAlpha ? '+' : ''}
            {trip.grade && (
              <Text style={[st.heroGrade, { color: GRADE_COLOR[trip.grade] }]}>  {trip.grade}</Text>
            )}
          </Text>
          {trip.recommendedPlan && trip.multiple != null && (
            <Text style={st.heroCompare}>
              {trip.multiple >= 1
                ? t('tripMultiple', { plan: trip.recommendedPlan.name, price: won(trip.recommendedPlan.price), x: trip.multiple })
                : t('tripAlmost', { plan: trip.recommendedPlan.name, price: won(trip.recommendedPlan.price) })}
            </Text>
          )}
          {!me.membership || me.membership.planCode === 'FREE' ? (
            <Pressable style={st.heroCta} onPress={() => router.push('/(tabs)/my')}>
              <Text style={st.heroCtaText}>{t('tripStartJam', { plan: trip.recommendedPlan?.name ?? '잼' })}</Text>
            </Pressable>
          ) : null}
        </Card>

        {/* Day별 */}
        {Array.from({ length: trip.days }).map((_, di) => {
          const dayDate = new Date(new Date(trip.startDate).getTime() + di * 86400_000);
          const items = trip.items.filter((i) => i.dayIndex === di);
          return (
            <View key={di}>
              <Text style={st.dayHead}>
                Day {di + 1} · {dayDate.toLocaleDateString(locale, { month: 'numeric', day: 'numeric', weekday: 'short' })}
              </Text>
              {items.length === 0 ? (
                <Pressable style={st.emptyDay} onPress={() => router.push('/saved' as never)}>
                  <Text style={st.emptyDayText}>{t('tripEmptyDay')}</Text>
                </Pressable>
              ) : (
                items.map((it) => (
                  <Pressable
                    key={`${it.itemType}:${it.refId}`}
                    style={st.itemRow}
                    onPress={() => router.push((it.itemType === 'PRODUCT' ? `/product/${it.refId}` : `/store/${it.merchant.id}`) as never)}
                  >
                    {it.merchant.thumbnailUrl || it.imageUrl ? (
                      <Image source={{ uri: img((it.imageUrl ?? it.merchant.thumbnailUrl)!, 240) }} style={st.thumb} />
                    ) : (
                      <View style={[st.thumb, st.thumbEmpty]}><Text>{it.merchant.emoji}</Text></View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.itemTitle} numberOfLines={1}>{it.title}</Text>
                      <Text style={st.itemSub} numberOfLines={1}>{it.merchant.name} · {it.merchant.region}</Text>
                    </View>
                    <Text style={st.itemSaving}>{it.saving != null && it.saving > 0 ? t('tripSaving', { amt: won(it.saving) }) : '+α'}</Text>
                    <Pressable hitSlop={10} onPress={() => removeItem(it)}>
                      <Text style={st.itemRemove}>✕</Text>
                    </Pressable>
                  </Pressable>
                ))
              )}
            </View>
          );
        })}

        <Text style={st.hint}>{t('tripHint')}</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  formTitle: { fontSize: 13, fontWeight: '700', color: C.ink3, marginBottom: 8, marginTop: 6 },
  input: {
    backgroundColor: C.ground, borderWidth: 1, borderColor: C.line, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink, textAlign: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepBtn: { fontSize: 24, fontWeight: '700', color: C.brand, paddingHorizontal: 18 },
  headcount: { fontSize: 18, fontWeight: '700', color: C.ink, minWidth: 60, textAlign: 'center' },
  recBox: { backgroundColor: '#FDF3DD', borderRadius: 9, padding: 10, marginVertical: 12 },
  recText: { fontSize: 13, fontWeight: '700', color: '#8a5600', textAlign: 'center' },
  cancelText: { fontSize: 13, color: C.ink3, textAlign: 'center', fontWeight: '600' },
  hint: { textAlign: 'center', color: C.ink3, fontSize: 12, marginTop: 14, marginBottom: 24, lineHeight: 18 },
  heroSub: { color: '#CFE1F2', fontSize: 13, fontWeight: '700' },
  heroSub2: { color: '#BCD6EC', fontSize: 11.5, marginTop: 2 },
  heroEdit: { color: '#CFE1F2', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  heroValue: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
  heroGrade: { fontSize: 16, fontWeight: '800' },
  heroCompare: { color: '#DCEBF8', fontSize: 12.5, fontWeight: '600', marginTop: 5 },
  heroCta: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  heroCtaText: { color: C.brand, fontWeight: '800', fontSize: 14, textAlign: 'center' },
  dayHead: { fontSize: 13.5, fontWeight: '800', color: C.brand, marginTop: 16, marginBottom: 7 },
  emptyDay: {
    borderWidth: 1.5, borderColor: C.line, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', backgroundColor: C.white,
  },
  emptyDayText: { fontSize: 12.5, color: C.ink3, fontWeight: '600' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12,
    padding: 10, marginBottom: 7,
  },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbEmpty: { backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  itemSub: { fontSize: 11, color: C.ink3, marginTop: 1 },
  itemSaving: { fontSize: 13, fontWeight: '800', color: '#E8503A' },
  itemRemove: { fontSize: 14, color: C.ink3, paddingHorizontal: 4 },
});
