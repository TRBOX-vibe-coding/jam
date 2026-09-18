/** 이용권 · 예약 · 받은 딜을 한 곳에서 */
import { useCallback, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRedeem } from '../lib/redeem';
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
  const [coupons, setCoupons] = useState<any[]>([]);

  const load = useCallback(() => {
    if (!me) return;
    api<any[]>('/me/vouchers').then(setVouchers).catch(() => setVouchers([]));
    api<any[]>('/me/claims').then(setClaims).catch(() => setClaims([]));
    // 상품에 묶여 받은 쿠폰 — 어느 이용권에서 왔는지(fromProduct)로 묶는다
    api<any>('/me/benefits?source=PRODUCT')
      .then((r) => setCoupons(r.merchants.flatMap((g: any) => g.items.map((i: any) => ({ ...i, merchant: g.merchant })))))
      .catch(() => setCoupons([]));
  }, [me, lang]);
  useFocusEffect(load);

  // 이용권은 사장님이 매장 코드를 입력, 딜은 사장님이 확인 — 흐름은 lib/redeem 한 곳에서 (2026-09-15)
  const redeem = useRedeem(load);
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
  /** 이 상품을 사면서 받은 쿠폰들 */
  const couponsOf = (productId: string) => coupons.filter((b) => b.fromProduct?.id === productId);
  /** 어느 이용권에도 안 붙는 쿠폰 — 예약만 하고 이용권이 없는 경우 등 */
  const looseCoupons = coupons.filter((b) => !vouchers.some((v) => v.productId === b.fromProduct?.id));
  function notifyOpensAt(opensAt: string) {
    const msg = t('opensOnDate', { date: new Date(opensAt).toLocaleDateString(locale, { month: 'long', day: 'numeric' }) });
    if (Platform.OS === 'web') window.alert(msg); else Alert.alert('', msg);
  }
  function notifyPending(productName: string) {
    const msg = t('pendingOpensWith', { name: productName });
    if (Platform.OS === 'web') window.alert(msg); else Alert.alert('', msg);
  }

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
                    title={t('useNow')}
                    small
                    onPress={() => redeem.open({ kind: 'VOUCHER', merchantId: v.product.merchant.id, merchantName: v.product.merchant.name, itemId: v.id, title: v.product.name })}
                  />
                </View>
              )}
              {/* 이 상품을 사면서 함께 받은 쿠폰 — 이용권을 쓰면 여기가 열린다 */}
              {couponsOf(v.productId).length > 0 && (
                <View style={st.bundle}>
                  <Text style={st.bundleTitle}>{t('bundledWith', { n: couponsOf(v.productId).length })}</Text>
                  {couponsOf(v.productId).map((b: any) => (
                    <View key={b.id} style={st.bundleRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.bundleName} numberOfLines={1}>{b.title}</Text>
                        <Text style={st.bundleSub} numberOfLines={1}>{b.merchant.name}</Text>
                      </View>
                      <Pressable
                        style={[st.useBtn, !b.canUse && st.useBtnOff]}
                        onPress={() =>
                          b.canUse
                            ? redeem.open({ kind: 'BENEFIT', merchantId: b.merchant.id, merchantName: b.merchant.name, itemId: b.id, title: b.title })
                            : b.opensAt ? notifyOpensAt(b.opensAt) : notifyPending(v.product.name)
                        }
                      >
                        {!b.canUse && <Ionicons name="lock-closed" size={11} color={C.ink3} />}
                        <Text style={[st.useBtnText, !b.canUse && st.useBtnTextOff]}>{t('useNow')}</Text>
                      </Pressable>
                    </View>
                  ))}
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
              {c.status === 'CLAIMED' && new Date(c.validTo).getTime() > Date.now() && (
                <View style={{ marginTop: 10 }}>
                  <Btn
                    title={t('useNow')}
                    small
                    onPress={() => redeem.open({ kind: 'DROP', merchantId: c.drop.merchant.id, merchantName: c.drop.merchant.name, itemId: c.id, title: c.drop.title })}
                  />
                </View>
              )}
            </Card>
          );
        })}

        {/* 이용권에 안 붙는 쿠폰 (예약만 한 상품 등) */}
        {looseCoupons.length > 0 && (
          <>
            <Text style={[st.section, { marginTop: 14 }]}>{t('otherBundled')}</Text>
            <Card>
              {looseCoupons.map((b: any) => (
                <View key={b.id} style={st.bundleRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.bundleName} numberOfLines={1}>{b.title}</Text>
                    <Text style={st.bundleSub} numberOfLines={1}>{b.merchant.name}{b.fromProduct ? ` · ${b.fromProduct.name}` : ''}</Text>
                  </View>
                  <Pressable
                    style={[st.useBtn, !b.canUse && st.useBtnOff]}
                    onPress={() =>
                      b.canUse
                        ? redeem.open({ kind: 'BENEFIT', merchantId: b.merchant.id, merchantName: b.merchant.name, itemId: b.id, title: b.title })
                        : b.opensAt ? notifyOpensAt(b.opensAt) : notifyPending(b.fromProduct?.name ?? '')
                    }
                  >
                    {!b.canUse && <Ionicons name="lock-closed" size={11} color={C.ink3} />}
                    <Text style={[st.useBtnText, !b.canUse && st.useBtnTextOff]}>{t('useNow')}</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      {/* 사용 처리 — 이용권은 사장님이 매장 코드, 딜은 사장님 확인 (lib/redeem) */}
      {redeem.modal}
    </Screen>
  );
}

const st = StyleSheet.create({
  bundle: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 },
  bundleTitle: { fontSize: 12, fontWeight: '800', color: C.ink2, marginBottom: 7 },
  bundleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 },
  bundleName: { fontSize: 13, fontWeight: '700', color: C.ink },
  bundleSub: { fontSize: 11.5, color: C.ink3, marginTop: 1 },
  useBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.brand, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: C.brand,
  },
  useBtnOff: { backgroundColor: C.white, borderColor: C.line },
  useBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  useBtnTextOff: { color: C.ink3 },
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
