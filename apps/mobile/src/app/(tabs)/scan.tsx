/**
 * 사용 탭 — "지금 매장에서 쓸 수 있는 것"을 모아두고 [사용하기]로 끝낸다.
 *
 * 2026-09-08 확정, 2026-09-15 재확인: 사진(QR) 찍기는 없다.
 *   - 할인 쿠폰 · 받은 딜 : [사용하기] → 화면을 사장님께 보여주기 → 사장님이 [확인]
 *   - 이용권           : [사용하기] → 사장님이 매장 코드 입력
 * 처리 흐름은 lib/redeem.tsx 한 곳에 있다. 매장 상세에서 넘어오면(?merchant=) 그 매장 것만 보여준다.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { couponValue } from '../../lib/coupons';
import { useI18n } from '../../lib/i18n';
import { useRedeem } from '../../lib/redeem';
import { C } from '../../lib/theme';
import { Btn, Card, Loading, Screen } from '../../lib/ui';

type CouponRow = {
  id: string; title: string; type: string; value: number; freebieName: string | null;
  canUse: boolean; fromProduct: { name: string } | null;
  merchant: { id: string; name: string; region: string; emoji: string };
};

function slotLabel(startAt: string, locale: string) {
  return new Date(startAt).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function UseTab() {
  const { me } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const { merchant: merchantParam } = useLocalSearchParams<{ merchant?: string }>();

  const [coupons, setCoupons] = useState<CouponRow[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [vouchers, setVouchers] = useState<any[] | null>(null);
  const [deals, setDeals] = useState<any[] | null>(null);
  const [onlyMerchant, setOnlyMerchant] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!me) return;
    api<any>('/me/benefits')
      .then((r) => {
        setPendingCount(r.pendingCount ?? 0);
        setCoupons(
          r.merchants.flatMap((g: any) =>
            g.items
              .filter((i: any) => i.canUse)
              .map((i: any) => ({
                ...i,
                merchant: {
                  id: g.merchant.id,
                  name: g.merchant.name,
                  region: g.merchant.region?.name ?? '',
                  emoji: g.merchant.category?.emoji ?? '',
                },
              })),
          ),
        );
      })
      .catch(() => setCoupons([]));
    const now = Date.now();
    api<any[]>('/me/vouchers')
      .then((rows) =>
        setVouchers(rows.filter((v) => ['ISSUED', 'RESERVED'].includes(v.status) && new Date(v.validTo).getTime() > now)),
      )
      .catch(() => setVouchers([]));
    api<any[]>('/me/claims')
      .then((rows) =>
        setDeals(rows.filter((c) => c.drop.kind === 'DEAL' && c.status === 'CLAIMED' && new Date(c.validTo).getTime() > now)),
      )
      .catch(() => setDeals([]));
  }, [me, lang]);
  useFocusEffect(load);

  // 매장 상세의 [매장에서 사용하기]로 들어오면 그 매장 것만 먼저 보여준다
  useEffect(() => {
    setOnlyMerchant(typeof merchantParam === 'string' && merchantParam ? merchantParam : null);
  }, [merchantParam]);

  const redeem = useRedeem(load);

  if (!me) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <Card>
            <Text style={st.guide}>{t('scanLoginGuide')}</Text>
            <Btn title={t('goLogin')} onPress={() => router.push('/(tabs)/my')} />
          </Card>
        </View>
      </Screen>
    );
  }
  if (!coupons || !vouchers || !deals) return <Screen><Loading /></Screen>;

  const vs = onlyMerchant ? vouchers.filter((v) => v.product.merchant.id === onlyMerchant) : vouchers;
  const ds = onlyMerchant ? deals.filter((d) => d.drop.merchant.id === onlyMerchant) : deals;
  const cs = onlyMerchant ? coupons.filter((c) => c.merchant.id === onlyMerchant) : coupons;
  const nothing = vs.length === 0 && ds.length === 0 && cs.length === 0;
  const storeName = onlyMerchant
    ? coupons.find((c) => c.merchant.id === onlyMerchant)?.merchant.name ??
      vouchers.find((v) => v.product.merchant.id === onlyMerchant)?.product.merchant.name ??
      deals.find((d) => d.drop.merchant.id === onlyMerchant)?.drop.merchant.name ??
      ''
    : '';
  const paidStarted = !!me.membership?.isPaid && !!me.membership?.started;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Card>
          <Text style={st.stepTitle}>{t('howToUse')}</Text>
          <Text style={st.step}>{t('step1')}</Text>
          <Text style={st.step}>{t('step2')}</Text>
          <Text style={st.step}>{t('step3')}</Text>
        </Card>

        {onlyMerchant && (
          <Pressable style={st.filterBar} onPress={() => setOnlyMerchant(null)}>
            <Text style={st.filterText} numberOfLines={1}>{t('onlyThisStore', { name: storeName })}</Text>
            <Text style={st.filterCta}>{t('more')} ›</Text>
          </Pressable>
        )}

        {nothing && (
          <Card style={{ marginTop: 4 }}>
            <Text style={st.emptyTitle}>{t('nothingToUse')}</Text>
            {!paidStarted && <Text style={st.emptySub}>{t('freeUseNote')}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Btn title={t('tabStore')} small tone="ghost" onPress={() => router.push('/(tabs)/store')} />
              </View>
              {!me.membership?.isPaid && (
                <View style={{ flex: 1 }}>
                  <Btn title={t('start')} small onPress={() => router.push('/(tabs)/jam' as never)} />
                </View>
              )}
            </View>
          </Card>
        )}

        {/* 이용권 — 사장님이 매장 코드를 입력 */}
        {vs.length > 0 && <Text style={st.section}>{t('myVouchers')} ({vs.length})</Text>}
        {vs.map((v) => (
          <View key={v.id} style={st.row}>
            <View style={[st.valueBox, st.ticketBox]}>
              <Ionicons name="ticket" size={22} color={C.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.title} numberOfLines={2}>{v.product.name}</Text>
              <Text style={st.sub} numberOfLines={1}>
                {v.product.merchant.name} · {t('people', { n: v.headcount })}
                {v.reservation?.slot ? ' · ' + slotLabel(v.reservation.slot.startAt, locale) : ''}
              </Text>
            </View>
            <Pressable
              style={st.useBtn}
              onPress={() =>
                redeem.open({
                  kind: 'VOUCHER',
                  merchantId: v.product.merchant.id,
                  merchantName: v.product.merchant.name,
                  itemId: v.id,
                  title: v.product.name,
                })
              }
            >
              <Text style={st.useBtnText}>{t('useNow')}</Text>
            </Pressable>
          </View>
        ))}

        {/* 받은 딜 — 사장님이 확인 */}
        {ds.length > 0 && <Text style={st.section}>{t('claimedDeals')} ({ds.length})</Text>}
        {ds.map((d) => (
          <View key={d.id} style={st.row}>
            <View style={st.valueBox}>
              <Text style={st.value} numberOfLines={1}>{won(d.drop.dropPrice)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.title} numberOfLines={2}>{d.drop.title}</Text>
              <Text style={st.sub} numberOfLines={1}>{d.drop.merchant.name}</Text>
            </View>
            <Pressable
              style={st.useBtn}
              onPress={() =>
                redeem.open({
                  kind: 'DROP',
                  merchantId: d.drop.merchant.id,
                  merchantName: d.drop.merchant.name,
                  itemId: d.id,
                  title: d.drop.title,
                })
              }
            >
              <Text style={st.useBtnText}>{t('useNow')}</Text>
            </Pressable>
          </View>
        ))}

        {/* 할인 쿠폰 — 사장님이 확인 */}
        {cs.length > 0 && <Text style={st.section}>{t('usableCoupons')} ({cs.length})</Text>}
        {cs.map((c) => {
          const v = couponValue(c);
          return (
            <View key={c.id} style={st.row}>
              <View style={st.valueBox}>
                <Text style={st.value} numberOfLines={1}>{v ?? t('freeLabel')}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.title} numberOfLines={2}>{c.title}</Text>
                <Text style={st.sub} numberOfLines={1}>{c.merchant.emoji} {c.merchant.name} · {c.merchant.region}</Text>
                {c.fromProduct && (
                  <Text style={st.from} numberOfLines={1}>{t('fromProduct', { name: c.fromProduct.name })}</Text>
                )}
              </View>
              <Pressable
                style={st.useBtn}
                onPress={() =>
                  redeem.open({
                    kind: 'BENEFIT',
                    merchantId: c.merchant.id,
                    merchantName: c.merchant.name,
                    itemId: c.id,
                    title: c.title,
                  })
                }
              >
                <Text style={st.useBtnText}>{t('useNow')}</Text>
              </Pressable>
            </View>
          );
        })}

        {/* 결제는 했지만 아직 잠긴 쿠폰 — 이용권을 쓰면 열린다 */}
        {pendingCount > 0 && !onlyMerchant && (
          <Pressable style={st.pendingBar} onPress={() => router.push('/wallet')}>
            <Ionicons name="lock-closed" size={15} color={C.ink2} />
            <Text style={st.pendingText}>{t('pendingNote', { n: pendingCount })}</Text>
            <Text style={st.filterCta}>›</Text>
          </Pressable>
        )}
      </ScrollView>
      {redeem.modal}
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 14, color: C.ink2, lineHeight: 21, marginBottom: 14, textAlign: 'center' },
  stepTitle: { fontSize: 13, fontWeight: '700', color: C.brand, marginBottom: 6 },
  step: { fontSize: 13, color: C.ink2, lineHeight: 22 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 14, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8,
  },
  valueBox: {
    minWidth: 60, height: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF1EC', borderRadius: 12, paddingHorizontal: 6,
  },
  ticketBox: { backgroundColor: C.brandSoft },
  value: { fontSize: 15, fontWeight: '800', color: '#E8503A', letterSpacing: -0.4 },
  title: { fontSize: 14, fontWeight: '700', color: C.ink },
  sub: { fontSize: 12, color: C.ink3, marginTop: 2 },
  from: { fontSize: 11, fontWeight: '700', color: C.brand, marginTop: 2 },
  useBtn: { backgroundColor: C.brand, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9 },
  useBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  filterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: C.brandSoft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4,
  },
  filterText: { flex: 1, fontSize: 13, fontWeight: '700', color: C.ink2 },
  filterCta: { fontSize: 13, fontWeight: '800', color: C.brand },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink, textAlign: 'center' },
  emptySub: { fontSize: 13, color: C.ink2, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  pendingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.ground, borderRadius: 12, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 11, marginTop: 8,
  },
  pendingText: { flex: 1, fontSize: 13, color: C.ink2 },
});
