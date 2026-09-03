/** 이용권 · 예약 · 받은 딜을 한 곳에서 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { C } from '../lib/theme';
import { Btn, Card, EmptyText, Loading, Screen, Tag } from '../lib/ui';

const VSTATUS: Record<string, { key: string; tone: 'ok' | 'brand' | 'bad' | 'warn' }> = {
  ISSUED: { key: 'stIssued', tone: 'ok' },
  RESERVED: { key: 'stReserved', tone: 'brand' },
  USED: { key: 'stUsed', tone: 'warn' },
  EXPIRED: { key: 'stExpired', tone: 'bad' },
  CANCELLED: { key: 'stCancelled', tone: 'bad' },
};
const CSTATUS: Record<string, { key: string; tone: 'ok' | 'brand' | 'bad' | 'warn' }> = {
  CLAIMED: { key: 'stIssued', tone: 'ok' },
  RESERVED: { key: 'stPaid', tone: 'brand' },
  USED: { key: 'stUsed', tone: 'warn' },
  EXPIRED: { key: 'stExpired', tone: 'bad' },
  CANCELLED: { key: 'stCancelled', tone: 'bad' },
  REFUNDED: { key: 'stRefunded', tone: 'bad' },
};

export default function WalletScreen() {
  const { me } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const [vouchers, setVouchers] = useState<any[] | null>(null);
  const [claims, setClaims] = useState<any[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      api<any[]>('/me/vouchers').then(setVouchers).catch(() => setVouchers([]));
      api<any[]>('/me/claims').then(setClaims).catch(() => setClaims([]));
    }, [me, lang]),
  );

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
  if (!vouchers || !claims) return <Screen><Loading /></Screen>;

  const deals = claims.filter((c) => c.drop.kind === 'DEAL');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={st.section}>{t('titleWallet')}</Text>
        {vouchers.length === 0 && <EmptyText text={t('noVouchers')} />}
        {vouchers.map((v) => {
          const stt = VSTATUS[v.status] ?? { key: v.status, tone: 'warn' as const };
          return (
            <Card key={v.id}>
              <View style={st.rowBetween}>
                <Text style={st.title}>{v.product.name}</Text>
                <Tag text={t(stt.key)} tone={stt.tone} />
              </View>
              <Text style={st.sub}>{v.product.merchant.name} · {t('people', { n: v.headcount })}</Text>
              {v.reservation && (
                <Text style={st.reserve}>
                  {t('bookedAt', {
                    date: new Date(v.reservation.slot.startAt).toLocaleString(locale, {
                      month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    }),
                  })}
                </Text>
              )}
              <Text style={st.code}>{t('codeAndDate', { code: v.code, date: new Date(v.validTo).toLocaleDateString(locale) })}</Text>
            </Card>
          );
        })}

        <Text style={[st.section, { marginTop: 14 }]}>{t('claimedDeals')}</Text>
        {deals.length === 0 && <EmptyText text={t('noDeals')} />}
        {deals.map((c) => {
          const stt = CSTATUS[c.status] ?? { key: c.status, tone: 'warn' as const };
          return (
            <Card key={c.id}>
              <View style={st.rowBetween}>
                <Text style={st.title}>{c.drop.title}</Text>
                <Tag text={t(stt.key)} tone={stt.tone} />
              </View>
              <Text style={st.sub}>
                {c.drop.merchant.name} · {won(c.drop.dropPrice)}{' '}
                <Text style={{ textDecorationLine: 'line-through' }}>{won(c.drop.normalPrice)}</Text>
              </Text>
              <Text style={st.code}>{t('useUntil', { date: new Date(c.validTo).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}</Text>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: C.ink, flex: 1 },
  sub: { fontSize: 13, color: C.ink2, marginTop: 4 },
  reserve: { fontSize: 13, color: C.brand, fontWeight: '700', marginTop: 6 },
  code: { fontSize: 11, color: C.ink3, marginTop: 6 },
});
