/** 이용권 · 예약 · 받은 딜을 한 곳에서 */
import { useCallback, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  // 결제 상품(이용권)의 QR 없는 사용 — 점주가 정한 매장 코드를 입력해 처리한다 (2026-09-08 픽스)
  const [pinTarget, setPinTarget] = useState<{ voucherId: string; merchantId: string; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  const load = useCallback(() => {
    if (!me) return;
    api<any[]>('/me/vouchers').then(setVouchers).catch(() => setVouchers([]));
    api<any[]>('/me/claims').then(setClaims).catch(() => setClaims([]));
  }, [me, lang]);
  useFocusEffect(load);

  async function usePinRedeem() {
    if (!pinTarget) return;
    setPinBusy(true);
    try {
      const r = await api<{ savedAmount: number; itemTitle: string; openedCoupons: number }>('/redeem', {
        method: 'POST',
        body: { merchantId: pinTarget.merchantId, itemType: 'VOUCHER', itemId: pinTarget.voucherId, pin: pin.trim() },
      });
      setPinTarget(null);
      setPin('');
      load();
      const opened = r.openedCoupons > 0 ? `
${t('couponsOpened', { n: r.openedCoupons })}` : '';
      const msg = `${t('usedDoneTitle')}
${r.itemTitle}${opened}`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert(t('usedDoneTitle'), `${r.itemTitle}${opened}`);
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message); else Alert.alert('', e.message);
    } finally {
      setPinBusy(false);
    }
  }

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
              {['ISSUED', 'RESERVED'].includes(v.status) && (
                <View style={st.facts}>
                  <View style={st.fact}>
                    <Text style={st.factLabel}>{t('factWhen')}</Text>
                    <Text style={st.factValue} numberOfLines={1}>
                      {v.reservation
                        ? new Date(v.reservation.slot.startAt).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : t('anytime')}
                    </Text>
                  </View>
                  <View style={st.fact}>
                    <Text style={st.factLabel}>{t('factWho')}</Text>
                    <Text style={st.factValue}>{t('people', { n: v.headcount })}</Text>
                  </View>
                  <View style={st.fact}>
                    <Text style={st.factLabel}>{t('factStatus')}</Text>
                    <Text style={[st.factValue, { color: C.ok }]}>{t('usableNow')}</Text>
                  </View>
                </View>
              )}
              <Text style={st.code}>{t('codeAndDate', { code: v.code, date: new Date(v.validTo).toLocaleDateString(locale) })}</Text>
              {['ISSUED', 'RESERVED'].includes(v.status) && (
                <View style={{ marginTop: 10 }}>
                  <Btn
                    title={t('useWithPin')}
                    small
                    onPress={() => { setPin(''); setPinTarget({ voucherId: v.id, merchantId: v.product.merchant.id, name: v.product.name }); }}
                  />
                </View>
              )}
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

      {/* 매장 코드 입력 모달 */}
      <Modal visible={pinTarget != null} transparent animationType="fade" onRequestClose={() => !pinBusy && setPinTarget(null)}>
        <View style={st.modalBack}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>{pinTarget?.name}</Text>
            <Text style={st.modalGuide}>{t('askStaffPin')}</Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              placeholder="****"
              placeholderTextColor={C.ink3}
              maxLength={10}
              autoFocus
              style={st.pinInput}
            />
            <Btn title={pinBusy ? '…' : t('confirmUse')} onPress={usePinRedeem} disabled={pin.trim().length < 2 || pinBusy} />
            <Pressable onPress={() => !pinBusy && setPinTarget(null)} style={{ marginTop: 10 }}>
              <Text style={st.modalCancel}>{t('close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '800', color: C.ink, flex: 1, letterSpacing: -0.3 },
  facts: {
    flexDirection: 'row', gap: 8, marginTop: 10,
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10,
  },
  fact: { flex: 1, minWidth: 0, alignItems: 'center' },
  factLabel: { fontSize: 10.5, fontWeight: '700', color: C.ink3 },
  factValue: { fontSize: 14.5, fontWeight: '800', color: C.ink, marginTop: 3 },
  sub: { fontSize: 13, color: C.ink2, marginTop: 4 },
  reserve: { fontSize: 13, color: C.brand, fontWeight: '700', marginTop: 6 },
  code: { fontSize: 11, color: C.ink3, marginTop: 6 },
  modalBack: { flex: 1, backgroundColor: 'rgba(10,20,30,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  modalCard: { backgroundColor: C.white, borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.ink, textAlign: 'center' },
  modalGuide: { fontSize: 13.5, color: C.ink2, textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 12 },
  modalCancel: { fontSize: 13, color: C.ink3, textAlign: 'center', fontWeight: '600' },
  pinInput: {
    backgroundColor: C.ground, borderWidth: 1, borderColor: C.line, borderRadius: 12,
    paddingVertical: 12, fontSize: 22, fontWeight: '700', color: C.ink,
    textAlign: 'center', letterSpacing: 6, marginBottom: 12,
  },
});
