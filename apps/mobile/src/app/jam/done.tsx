/**
 * 잼 결제 완료 (2026-09-18).
 *
 * 결제가 됐다는 말만 하고 끝내지 않는다. 언제부터 언제까지인지, 무엇이 열렸는지,
 * 그래서 다음에 어디로 가면 되는지까지 한 화면에 둔다.
 */
import { useLocalSearchParams, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lastUsableDay } from '../../lib/date';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, Screen } from '../../lib/ui';

export default function JamDoneScreen() {
  const p = useLocalSearchParams<{
    name?: string; code?: string; start?: string; end?: string;
    coupons?: string; merchants?: string; orderNo?: string;
  }>();
  const { t, locale } = useI18n();

  const start = p.start ? new Date(p.start) : null;
  const end = p.end ? lastUsableDay(p.end) : null;
  const fmt = (d: Date) => d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const upcoming = !!start && start.getTime() > Date.now();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={st.top}>
          <View style={st.check}><Ionicons name="checkmark" size={34} color="#fff" /></View>
          <Text style={st.title}>{t('jamDoneTitle', { name: p.name ?? '' })}</Text>
          <Text style={st.sub}>{upcoming ? t('jamDoneUpcoming') : t('jamDoneNow')}</Text>
        </View>

        <Card>
          <View style={st.row}>
            <Text style={st.label}>{t('jamPeriodLabel')}</Text>
            <Text style={st.value}>
              {start && end ? `${fmt(start)} ~ ${fmt(end)}` : '-'}
            </Text>
          </View>
          <View style={st.row}>
            <Text style={st.label}>{t('jamOpensCoupons')}</Text>
            <Text style={st.value}>{t('nCoupons', { n: p.coupons ?? '0' })}</Text>
          </View>
          <View style={st.row}>
            <Text style={st.label}>{t('jamOpensMerchants')}</Text>
            <Text style={st.value}>{t('nPlaces', { n: p.merchants ?? '0' })}</Text>
          </View>
          {p.orderNo ? (
            <View style={[st.row, st.last]}>
              <Text style={st.label}>{t('orderNo')}</Text>
              <Text style={st.orderNo}>{p.orderNo}</Text>
            </View>
          ) : null}
        </Card>

        <View style={{ gap: 9, marginTop: 6 }}>
          <Btn title={t('jamDoneGoCoupons')} onPress={() => router.replace('/(tabs)/store' as never)} />
          <Btn title={t('jamDoneGoTrip')} tone="ghost" onPress={() => router.replace('/(tabs)/trip' as never)} />
        </View>

        <Text style={st.note}>{upcoming ? t('jamDoneNoteUpcoming') : t('jamDoneNoteNow')}</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  top: { alignItems: 'center', paddingVertical: 22 },
  check: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontSize: 21, fontWeight: '800', color: C.ink, textAlign: 'center' },
  sub: { fontSize: 13.5, color: C.ink2, marginTop: 6, textAlign: 'center', lineHeight: 20 },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  last: { borderBottomWidth: 0 },
  label: { fontSize: 13, color: C.ink3, fontWeight: '600' },
  value: { fontSize: 13.5, color: C.ink, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  orderNo: { fontSize: 12, color: C.ink2, fontVariant: ['tabular-nums'] },

  note: { fontSize: 12, color: C.ink3, textAlign: 'center', marginTop: 18, lineHeight: 18 },
});
