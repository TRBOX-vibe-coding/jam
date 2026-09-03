/**
 * 매장 QR 스캔 결과 — "이 매장에서 지금 쓸 수 있는 것"만 보여주고, 골라서 사용처리.
 */
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, EmptyText, Loading, Screen, Tag } from '../../lib/ui';

type ScanResult = {
  merchant: { id: string; name: string; region: string; address: string | null };
  benefits: { id: string; title: string; type: string; companionLimit: number | null; conditions: string | null; blocked: string | null }[];
  dropClaims: { id: string; title: string; qty: number; normalPrice: number; dropPrice: number; blocked: string | null }[];
  vouchers: { id: string; code: string; productName: string; verification: string; headcount: number; reservedAt: string | null }[];
  empty: boolean;
};

export default function UseScreen() {
  const { qr } = useLocalSearchParams<{ qr: string }>();
  const { t, won, locale } = useI18n();
  const [data, setData] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setError('');
      api<ScanResult>(`/scan/${encodeURIComponent(qr!)}`)
        .then(setData)
        .catch((e) => setError(e.message));
    }, [qr]),
  );

  async function redeem(itemType: 'BENEFIT' | 'DROP' | 'VOUCHER', itemId: string, title: string) {
    const run = async () => {
      setBusy(true);
      try {
        const r = await api<any>('/redeem', {
          method: 'POST',
          body: { qrCode: qr, itemType, itemId },
        });
        router.replace({
          pathname: '/done',
          params: {
            merchantName: r.merchantName,
            itemTitle: r.itemTitle,
            savedAmount: String(r.savedAmount),
            verifyToken: r.verifyToken,
            staff: r.staffCheckRequired ? '1' : '0',
          },
        });
      } catch (e: any) {
        if (Platform.OS === 'web') window.alert(e.message);
        else Alert.alert(t('cantUse'), e.message);
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('useConfirmWeb', { title }))) await run();
    } else {
      Alert.alert(t('useConfirmTitle'), `"${title}"\n${t('pressBeforeStaff')}`, [
        { text: t('cancel'), style: 'cancel' },
        { text: t('useNow'), style: 'destructive', onPress: run },
      ]);
    }
  }

  if (error) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <EmptyText text={error} />
          <Btn title={t('rescan')} tone="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }
  if (!data) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ backgroundColor: C.brandSoft, borderColor: C.brandSoft }}>
          <Text style={st.merchantName}>{data.merchant.name}</Text>
          <Text style={st.merchantSub}>{data.merchant.region} · {data.merchant.address ?? ''}</Text>
        </Card>

        {data.empty && (
          <EmptyText text={t('nothingHere')} />
        )}

        {data.vouchers.length > 0 && <Text style={st.section}>{t('myVouchers')}</Text>}
        {data.vouchers.map((v) => (
          <Card key={v.id}>
            <Text style={st.itemTitle}>{v.productName}</Text>
            <Text style={st.itemSub}>
              {t('voucherMeta', { n: v.headcount, code: v.code })}
              {v.reservedAt ? t('reservedMeta', { date: new Date(v.reservedAt).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : ''}
            </Text>
            {v.verification !== 'QR_ONLY' && (
              <View style={{ marginBottom: 8 }}><Tag text={t('staffItem')} tone="warn" /></View>
            )}
            <Btn title={t('useNow')} small onPress={() => redeem('VOUCHER', v.id, v.productName)} disabled={busy} />
          </Card>
        ))}

        {data.dropClaims.length > 0 && <Text style={st.section}>{t('claimedDeals')}</Text>}
        {data.dropClaims.map((d) => (
          <Card key={d.id}>
            <Text style={st.itemTitle}>{d.title}</Text>
            <Text style={st.itemSub}>
              {won(d.dropPrice)} <Text style={{ textDecorationLine: 'line-through' }}>{won(d.normalPrice)}</Text> · {d.qty}개
            </Text>
            {d.blocked ? (
              <Tag text={d.blocked} tone="bad" />
            ) : (
              <Btn title={t('useNow')} small onPress={() => redeem('DROP', d.id, d.title)} disabled={busy} />
            )}
          </Card>
        ))}

        {data.benefits.length > 0 && <Text style={st.section}>{t('alwaysBenefits')}</Text>}
        {data.benefits.map((b) => (
          <Card key={b.id}>
            <Text style={st.itemTitle}>{b.title}</Text>
            <Text style={st.itemSub}>
              {b.companionLimit == null ? t('noCompanionLimit') : t('companionUpTo', { n: b.companionLimit })}
              {b.conditions ? ` · ${b.conditions}` : ''}
            </Text>
            {b.blocked ? (
              <Tag text={b.blocked} tone="bad" />
            ) : (
              <Btn title={t('useNow')} small onPress={() => redeem('BENEFIT', b.id, b.title)} disabled={busy} />
            )}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  merchantName: { fontSize: 18, fontWeight: '700', color: C.brand },
  merchantSub: { fontSize: 12, color: C.ink2, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 10, marginBottom: 8 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  itemSub: { fontSize: 12, color: C.ink3, marginTop: 3, marginBottom: 10 },
});
