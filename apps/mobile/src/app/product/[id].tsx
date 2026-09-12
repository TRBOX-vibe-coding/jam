/**
 * 상품 상세 — 예약형은 날짜·시간·인원 선택 → 결제 → 예약확정까지 앱 안에서 끝낸다.
 */
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { track } from '../../lib/analytics';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, LoadError, Loading, Screen, Tag } from '../../lib/ui';
import { couponValue } from '../../lib/coupons';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const [p, setP] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false); // 담기(찜)
  const [slotId, setSlotId] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api<any>(`/products/${id}`).then((r) => {
      setP(r);
      track('product_view', { type: 'product', id: String(id) });
    }).catch(() => setFailed(true));
    if (me) api<string[]>('/me/saves/ids').then((ids) => setSaved(ids.includes(`PRODUCT:${id}`))).catch(() => {});
  }, [id, lang, me]);
  useFocusEffect(load);

  async function toggleSave() {
    if (!me) { router.push('/(tabs)/my'); return; }
    setSaved((s) => !s);
    try {
      await api('/me/saves', { method: 'POST', body: { itemType: 'PRODUCT', refId: id } });
    } catch {
      setSaved((s) => !s);
    }
  }

  async function purchase() {
    if (!me) {
      router.push('/(tabs)/my');
      return;
    }
    if (p.type === 'RESERVATION' && !slotId) {
      notify(t('resvTimeTitle'), t('pickTimeFirst'));
      return;
    }
    setBusy(true);
    try {
      const r = await api<any>(`/products/${id}/purchase`, {
        method: 'POST',
        body: { slotId: slotId ?? undefined, headcount, contactName: me.nickname },
      });
      track('product_purchase', { type: 'product', id: String(id) }, { headcount });
      notify(t('doneTitle'), r.message);
      router.push('/wallet');
    } catch (e: any) {
      notify(t('cantBuy'), e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!p) {
    return <Screen>{failed ? <LoadError text={t('loadFailed')} retryLabel={t('retry')} onRetry={load} /> : <Loading />}</Screen>;
  }

  const unit = me?.membership?.isPaid && p.memberPrice != null ? p.memberPrice : p.basePrice;
  const total = p.type === 'RESERVATION' ? unit * headcount : unit;

  return (
    <Screen>
      {/* 하단 고정 결제바에 가리지 않도록 여백을 넉넉히 둔다 */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        {p.imageUrl && <Image source={{ uri: img(p.imageUrl, 960) }} style={st.hero} />}
        <Card>
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
            <Tag text={p.type === 'RESERVATION' ? t('typeReservation') : p.type === 'PASS' ? 'PASS' : t('typeTicket')} />
            {p.weatherDependent && <Tag text={t('weather')} tone="warn" />}
            {p.verification !== 'QR_ONLY' && <Tag text={t('staffVerify')} tone="warn" />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Text style={[st.title, { flex: 1 }]}>{p.name}</Text>
            <Pressable hitSlop={10} onPress={toggleSave} style={{ marginTop: 3 }}>
              <Ionicons name={saved ? 'heart' : 'heart-outline'} size={26} color={saved ? '#E8503A' : C.ink3} />
            </Pressable>
          </View>
          <Text style={st.merchant}>{p.merchant.name} · {p.merchant.address ?? ''}</Text>
          {p.description && <Text style={st.desc}>{p.description}</Text>}

          <View style={st.priceRow}>
            {me?.membership?.isPaid && p.memberPrice != null ? (
              <>
                <Tag text={t('memberPrice')} tone="gold" />
                <Text style={st.price}>{won(p.memberPrice)}</Text>
                <Text style={st.normal}>{won(p.basePrice)}</Text>
              </>
            ) : (
              <>
                <Text style={st.price}>{won(p.basePrice)}</Text>
                {p.memberPrice != null && (
                  <Text style={st.memberHint}>{t('memberPriceHint', { price: won(p.memberPrice) })}</Text>
                )}
              </>
            )}
          </View>
          {p.cancelPolicy && <Text style={st.policy}>· {p.cancelPolicy}</Text>}
        </Card>

        {p.type === 'RESERVATION' && (
          <>
            <Text style={st.section}>{t('pickTime')}</Text>
            {p.slots.length === 0 && <Card><Text style={st.noSlot}>{t('noSlots')}</Text></Card>}
            {p.slots.map((s: any) => {
              const label = new Date(s.startAt).toLocaleString(locale, {
                month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
              });
              const disabled = s.remaining < headcount;
              return (
                <Pressable key={s.id} onPress={() => !disabled && setSlotId(s.id)}>
                  <Card style={slotId === s.id ? { borderColor: C.brand, borderWidth: 2 } : undefined}>
                    <View style={st.rowBetween}>
                      <Text style={[st.slotLabel, disabled && { color: C.ink3 }]}>{label}</Text>
                      <Text style={[st.slotRemain, disabled && { color: C.bad }]}>
                        {disabled ? t('closedNow') : t('seatsLeft', { n: s.remaining })}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })}

          </>
        )}

        {/* 결제하면 함께 받는 '근처 할인 쿠폰' — 무료 회원도 이건 그대로 쓴다 (2026-09-12 대표 확정) */}
        {p.bundledCoupons?.length > 0 && (
          <>
            <Text style={st.section}>{t('bundledTitle')}</Text>
            <Card>
              <Text style={st.bundledSub}>{t('bundledSub')}</Text>
              {p.bundledCoupons.map((c: any, i: number) => (
                <View key={c.benefitId} style={[st.bundledRow, i > 0 && st.bundledDivider]}>
                  <View style={st.bundledValueBox}>
                    <Text style={st.bundledValue}>{couponValue(c) ?? t('freeLabel')}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.bundledName} numberOfLines={1}>{c.title}</Text>
                    <Text style={st.bundledMerchant} numberOfLines={1}>
                      {c.merchant.category.emoji} {c.merchant.name} · {c.merchant.region.name}
                    </Text>
                  </View>
                </View>
              ))}
              <Text style={st.bundledDays}>{t('bundledDays', { n: Math.min(...p.bundledCoupons.map((c: any) => c.validDays)) })}</Text>
            </Card>
          </>
        )}
      </ScrollView>

      {/* 하단 고정 결제바 — 스크롤과 무관하게 항상 보인다 */}
      <View style={st.payBar}>
        {p.type === 'RESERVATION' && (
          <View style={st.stepper}>
            <Pressable hitSlop={8} onPress={() => setHeadcount((h) => Math.max(1, h - 1))}>
              <Text style={st.stepBtn}>−</Text>
            </Pressable>
            <Text style={st.headcount}>{t('people', { n: headcount })}</Text>
            <Pressable hitSlop={8} onPress={() => setHeadcount((h) => Math.min(10, h + 1))}>
              <Text style={st.stepBtn}>＋</Text>
            </Pressable>
          </View>
        )}
        <Btn
          title={p.type === 'RESERVATION' ? t('payTotalReserve', { price: won(total) }) : t('payTotal', { price: won(total) })}
          onPress={purchase}
          disabled={busy}
        />
        <Text style={st.note}>
          {p.type === 'RESERVATION' ? t('resvNote') : p.type === 'PASS' ? t('passNote') : t('ticketNote')}
        </Text>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { width: '100%', height: 190, borderRadius: 16, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: C.ink, lineHeight: 27 },
  merchant: { fontSize: 13, color: C.ink3, marginTop: 4 },
  desc: { fontSize: 14, color: C.ink2, marginTop: 10, lineHeight: 21 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  price: { fontSize: 24, fontWeight: '700', color: C.ink },
  normal: { fontSize: 14, color: C.ink3, textDecorationLine: 'line-through' },
  memberHint: { fontSize: 12, color: C.gold, fontWeight: '700' },
  policy: { fontSize: 12, color: C.warn, marginTop: 8 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 12, marginBottom: 8 },
  noSlot: { fontSize: 13, color: C.ink3, textAlign: 'center' },
  slotLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  slotRemain: { fontSize: 13, fontWeight: '700', color: C.brand },
  stepBtn: { fontSize: 24, fontWeight: '700', color: C.brand, paddingHorizontal: 14 },
  headcount: { fontSize: 17, fontWeight: '700', color: C.ink, minWidth: 52, textAlign: 'center' },
  note: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 8, lineHeight: 16 },
  bundledSub: { fontSize: 12.5, color: C.ink2, marginBottom: 10, lineHeight: 18 },
  bundledRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  bundledDivider: { borderTopWidth: 1, borderTopColor: C.line },
  bundledValueBox: {
    minWidth: 56, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF1EC', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 6,
  },
  bundledValue: { fontSize: 15, fontWeight: '800', color: '#E8503A', letterSpacing: -0.4 },
  bundledName: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  bundledMerchant: { fontSize: 11.5, color: C.ink3, marginTop: 1 },
  bundledDays: { fontSize: 11, color: C.ink3, marginTop: 8, textAlign: 'right' },
  payBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 8,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
