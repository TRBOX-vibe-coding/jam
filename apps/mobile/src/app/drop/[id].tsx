/** DROP 상세 — 받기(DEAL) 또는 바로 결제(TICKET) */
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, Loading, Screen, Tag } from '../../lib/ui';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

const fmtMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default function DropDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const [d, setD] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<any>(`/drops/${id}`).then(setD).catch(() => {});
    }, [id, lang]),
  );

  async function claim() {
    if (!me) {
      router.push('/(tabs)/my');
      return;
    }
    setBusy(true);
    try {
      const r = await api<any>(`/drops/${id}/claim`, { method: 'POST', body: {} });
      notify(r.type === 'TICKET' ? t('paidDone') : t('claimed'), r.message);
      if (r.type === 'TICKET') router.push('/wallet');
      else router.back();
    } catch (e: any) {
      notify(t('cantClaim'), e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <Screen><Loading /></Screen>;

  const soldOut = d.remainingQty <= 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {d.imageUrl && <Image source={{ uri: img(d.imageUrl, 960) }} style={st.hero} />}
        <Card>
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
            <Tag text={`${d.category.emoji} ${d.region.name}`} />
            {d.audience === 'MEMBER_ONLY' && <Tag text={t('memberOnly')} tone="gold" />}
            {d.isSponsored && <Tag text={t('ad')} tone="warn" />}
            <Tag text={d.kind === 'TICKET' ? t('payInApp') : t('payOnSite')} tone="ok" />
          </View>
          <Text style={st.title}>{d.title}</Text>
          <Text style={st.merchant}>{d.merchant.name} · {d.merchant.address ?? ''}</Text>
          {d.description && <Text style={st.desc}>{d.description}</Text>}

          <View style={st.priceRow}>
            <Text style={st.rate}>{Math.round((1 - d.dropPrice / d.normalPrice) * 100)}%</Text>
            <Text style={st.price}>{won(d.dropPrice)}</Text>
            <Text style={st.normal}>{won(d.normalPrice)}</Text>
          </View>

          <View style={st.infoBox}>
            <Text style={st.info}>{t('stockLine', { a: d.remainingQty, b: d.totalQty })}</Text>
            <Text style={st.info}>{t('perUnitLine', { n: d.personsPerUnit })}</Text>
            <Text style={st.info}>{t('closeLine', { date: new Date(d.closeAt).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}</Text>
            {d.usableFromMinute != null && (
              <Text style={st.info}>{t('usableTime', { a: fmtMin(d.usableFromMinute), b: fmtMin(d.usableToMinute) })}</Text>
            )}
            {d.maxPerUser && <Text style={st.info}>{t('maxPerUser', { n: d.maxPerUser })}</Text>}
          </View>
        </Card>

        {d.locked ? (
          <Card style={{ backgroundColor: C.warnSoft, borderColor: C.warnSoft }}>
            <Text style={st.lockText}>{t('memberOnlyDrop')}</Text>
            <Btn title={t('seeMembership')} onPress={() => router.push('/(tabs)/my')} />
          </Card>
        ) : (
          <Btn
            title={
              soldOut ? t('soldOut') :
              d.kind === 'TICKET' ? t('payAndGet', { price: won(d.dropPrice) }) : t('getFree')
            }
            onPress={claim}
            disabled={busy || soldOut}
          />
        )}
        <Text style={st.note}>
          {d.kind === 'TICKET' ? t('ticketNote') : t('dealNote')}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { width: '100%', height: 190, borderRadius: 16, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: C.ink, lineHeight: 27 },
  merchant: { fontSize: 13, color: C.ink3, marginTop: 4 },
  desc: { fontSize: 14, color: C.ink2, marginTop: 10, lineHeight: 21 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 },
  rate: { fontSize: 24, fontWeight: '700', color: C.bad },
  price: { fontSize: 24, fontWeight: '700', color: C.ink },
  normal: { fontSize: 14, color: C.ink3, textDecorationLine: 'line-through' },
  infoBox: { backgroundColor: C.ground, borderRadius: 10, padding: 12, marginTop: 14, gap: 3 },
  info: { fontSize: 12.5, color: C.ink2 },
  lockText: { fontSize: 14, fontWeight: '700', color: C.warn, textAlign: 'center', marginBottom: 10 },
  note: { fontSize: 12, color: C.ink3, textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
