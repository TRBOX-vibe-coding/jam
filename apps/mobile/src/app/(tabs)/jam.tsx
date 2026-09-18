/**
 * 잼 — 멤버십을 고르고 시작하는 탭 (2026-09-18 하단바 개편).
 *
 * 전에는 MY 안쪽에 묻혀 있어서 "3일잼은 어디서 사냐"는 말이 나왔다. 돈이 들어오는 화면이니 하단바로 뺀다.
 * 파는 것만 두면 가격표가 되니까 위에 '얼마 아끼는지'를 얹는다 — 일정 탭을 뺀 대신
 * 여행 요약과 일정으로 가는 길을 여기에 둔다.
 */
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, img } from '../../lib/api';
import { untilText } from '../../lib/date';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, Loading, Screen, Tag } from '../../lib/ui';

type Plan = {
  id: string; code: string; name: string; description: string | null;
  price: number; durationDays: number;
  scope: 'ALL' | 'FILTER' | 'REGION' | 'CATEGORY' | 'MANUAL';
  scopeRegionIds: string[]; scopeCategoryIds: string[];
  isPrivate: boolean; imageUrl: string | null;
};
type Named = { id: string; name: string; emoji?: string };
type Trip = {
  startDate: string; endDate: string; headcount: number; days: number;
  totalSaving: number; hasPlusAlpha: boolean;
  recommendedPlan: { code: string; name: string; price: number } | null;
  multiple: number | null;
} | null;

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

export default function JamScreen() {
  const { ready, me, refresh } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [regions, setRegions] = useState<Named[]>([]);
  const [cats, setCats] = useState<Named[]>([]);
  const [trip, setTrip] = useState<Trip>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Plan[]>('/membership/plans')
      .then((rows) => setPlans(rows.filter((p) => p.price > 0)))
      .catch(() => setPlans([]));
    api<Named[]>('/regions').then(setRegions).catch(() => {});
    api<Named[]>('/categories').then(setCats).catch(() => {});
    if (me) api<{ trip: Trip }>('/me/trip').then((r) => setTrip(r.trip)).catch(() => {});
    else setTrip(null);
  }, [me, lang]);
  useFocusEffect(load);

  /** 이 잼이 여는 범위를 이름으로 한 줄 — 아이디 개수만 세면 고객은 못 알아본다 */
  function scopeLine(p: Plan) {
    if (p.scope === 'ALL') return t('jamScopeAll');
    if (p.scope === 'MANUAL') return t('jamScopePicked');
    // 열린 지역을 전부 고른 잼(3일잼·5일잼)은 사실상 전체다 — 지역 이름을 6개 늘어놓지 않는다
    const everyRegion = regions.length > 0 && p.scopeRegionIds.length >= regions.length;
    if (everyRegion && p.scopeCategoryIds.length === 0) return t('jamScopeAll');
    const names = [
      ...p.scopeRegionIds.map((id) => regions.find((r) => r.id === id)?.name),
      ...p.scopeCategoryIds.map((id) => cats.find((c) => c.id === id)?.name),
    ].filter(Boolean) as string[];
    if (names.length === 0) return t('jamScopeAll');
    if (names.length <= 2) return names.join(' · ');
    return t('jamScopeMore', { name: names.slice(0, 2).join(' · '), n: names.length - 2 });
  }

  /** 고르면 결제 화면으로. 가격·시작일·무엇이 열리는지는 거기서 보여준다 */
  function buy(plan: Plan) {
    if (!me) {
      notify(t('jamLoginFirst'), '');
      router.push('/(tabs)/my' as never);
      return;
    }
    router.push(`/jam/${plan.code}` as never);
  }

  /** 단체 코드 — 기관마다 잼이 달라서, 코드를 넣으면 그 잼이 목록에 나타난다 */
  async function askOrgCode() {
    if (!me) { router.push('/(tabs)/my' as never); return; }
    const code = Platform.OS === 'web' ? window.prompt(t('orgCodeAsk')) : null;
    if (!code) return;
    setBusy(true);
    try {
      const r = await api<{ planName: string }>('/me/org-code', { method: 'POST', body: { code } });
      await refresh();
      load();
      notify('', t('orgCodeDone', { name: r.planName }));
    } catch (e: any) {
      notify(t('cantBuy'), e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !plans) return <Screen><Loading /></Screen>;

  const mine = (me?.memberships ?? []).filter((m) => m.isPaid);
  const owned = (code: string) => mine.some((m) => m.planCode === code);
  const buyable = plans.filter((p) => !owned(p.code));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

        {/* 얼마 아끼는지 — 파는 화면의 첫 줄은 가격이 아니라 이득이다 */}
        {trip ? (
          <Pressable style={st.saving} onPress={() => router.push('/(tabs)/trip' as never)}>
            <Text style={st.savingLabel}>{t('savedLabelTrip')}</Text>
            <Text style={st.savingValue}>{won(trip.totalSaving)}{trip.hasPlusAlpha ? '+' : ''}</Text>
            <Text style={st.savingSub}>
              {trip.recommendedPlan && trip.multiple != null
                ? t('tripMultiple', { plan: trip.recommendedPlan.name, price: won(trip.recommendedPlan.price), x: trip.multiple })
                : t('tripHeroTitle', { nights: trip.days - 1, days: trip.days, n: trip.headcount })}
            </Text>
            <Text style={st.savingCta}>{t('titleTrip')} · {t('tripEdit')} ›</Text>
          </Pressable>
        ) : (
          <Pressable style={st.calc} onPress={() => router.push('/(tabs)/trip' as never)}>
            <Ionicons name="calculator-outline" size={20} color={C.brand} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.calcTitle}>{t('jamCalcTitle')}</Text>
              <Text style={st.calcSub}>{t('jamCalcSub')}</Text>
            </View>
            <Text style={st.calcCta}>›</Text>
          </Pressable>
        )}

        {/* 가진 잼 — 겹쳐 두면 합쳐서 쓴다 */}
        {mine.length > 0 && (
          <>
            <Text style={st.section}>{t('myJams')}</Text>
            {mine.map((m) => (
              <Card key={m.planCode}>
                <View style={st.rowBetween}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.planName}>{m.planName}</Text>
                    <Text style={st.planDesc}>
                      {m.started
                        ? t('untilDate', { date: untilText(m.endAt, locale) })
                        : t('cardUpcoming', { plan: m.planName, date: new Date(m.startAt).toLocaleDateString(locale) })}
                    </Text>
                  </View>
                  <Tag text={m.started ? t('usableNow') : t('stIssued')} tone={m.started ? 'gold' : 'warn'} />
                </View>
              </Card>
            ))}
          </>
        )}

        {buyable.length > 0 && (
          <Text style={st.section}>{mine.length > 0 ? t('addJamSection') : t('startPlanSection')}</Text>
        )}
        {mine.length === 0 && <Text style={st.lead}>{t('jamLead')}</Text>}

        {buyable.map((p) => (
          <View key={p.code} style={st.jamCard}>
            {p.imageUrl ? <Image source={{ uri: img(p.imageUrl, 720) }} style={st.jamImg} /> : null}
            <View style={{ padding: 14 }}>
              <View style={st.rowBetween}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={st.nameRow}>
                    <Text style={st.jamName}>{p.name}</Text>
                    {p.isPrivate ? <Tag text={t('orgOnly')} tone="warn" /> : null}
                  </View>
                  {p.description ? <Text style={st.jamDesc}>{p.description}</Text> : null}
                </View>
                <Text style={st.jamPrice}>{won(p.price)}</Text>
              </View>
              <View style={st.metaRow}>
                <View style={st.metaChip}>
                  <Ionicons name="time-outline" size={13} color={C.ink2} />
                  <Text style={st.metaText}>{t('jamDays', { n: p.durationDays })}</Text>
                </View>
                <View style={st.metaChip}>
                  <Ionicons name="pricetags-outline" size={13} color={C.ink2} />
                  <Text style={st.metaText}>{scopeLine(p)}</Text>
                </View>
              </View>
              <View style={{ marginTop: 11, alignItems: 'flex-start' }}>
                <Btn title={t('startShort')} small onPress={() => buy(p)} disabled={busy} />
              </View>
            </View>
          </View>
        ))}
        {buyable.length === 0 && <Text style={st.allOwned}>{t('jamAllOwned')}</Text>}

        {/* 단체 코드 — 회사나 기관에서 받은 코드를 넣으면 전용 잼이 위 목록에 나타난다 */}
        <Pressable style={st.org} onPress={askOrgCode}>
          <Ionicons name="business-outline" size={18} color={C.ink2} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.orgTitle}>{t('orgCodeTitle')}</Text>
            <Text style={st.orgSub}>{me?.orgCode ? t('orgCodeSet', { code: me.orgCode }) : t('orgCodeHint')}</Text>
          </View>
          <Text style={st.calcCta}>›</Text>
        </Pressable>

        <Text style={st.foot}>{t('jamFoot')}</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 20, marginBottom: 8 },
  lead: { fontSize: 13, color: C.ink2, marginTop: -4, marginBottom: 10, lineHeight: 19 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },

  saving: { backgroundColor: C.brand, borderRadius: 16, padding: 16 },
  savingLabel: { color: '#CFE7F7', fontSize: 12, fontWeight: '700' },
  savingValue: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 3, letterSpacing: -0.5 },
  savingSub: { color: '#DCEDF9', fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  savingCta: { color: '#fff', fontSize: 12.5, fontWeight: '800', marginTop: 9 },

  calc: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: C.brandSoft, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
  },
  calcTitle: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  calcSub: { fontSize: 12.5, color: C.ink2, marginTop: 2, lineHeight: 17 },
  calcCta: { fontSize: 18, fontWeight: '800', color: C.brand },

  planName: { fontSize: 15, fontWeight: '700', color: C.ink },
  planDesc: { fontSize: 12.5, color: C.ink3, marginTop: 2 },

  jamCard: {
    backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line,
    overflow: 'hidden', marginBottom: 10,
  },
  jamImg: { width: '100%', height: 104 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  jamName: { fontSize: 17, fontWeight: '800', color: C.ink },
  jamDesc: { fontSize: 12.5, color: C.ink3, marginTop: 3, lineHeight: 18 },
  jamPrice: { fontSize: 18, fontWeight: '800', color: C.brand },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.ground, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
  },
  metaText: { fontSize: 11.5, fontWeight: '700', color: C.ink2 },

  org: {
    flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 14,
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  orgTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  orgSub: { fontSize: 12, color: C.ink3, marginTop: 2, lineHeight: 17 },

  allOwned: { fontSize: 13, color: C.ink2, textAlign: 'center', marginTop: 4, marginBottom: 4 },
  foot: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 20, lineHeight: 17 },
});
