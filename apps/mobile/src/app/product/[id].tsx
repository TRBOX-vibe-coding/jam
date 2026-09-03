/**
 * 상품 상세 — 예약형은 날짜·시간·인원 선택 → 결제 → 예약확정까지 앱 안에서 끝낸다.
 */
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const [p, setP] = useState<any | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState(1);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<any>(`/products/${id}`).then(setP).catch(() => {});
    }, [id, lang]),
  );

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
      notify(t('doneTitle'), r.message);
      router.push('/wallet');
    } catch (e: any) {
      notify(t('cantBuy'), e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!p) return <Screen><Loading /></Screen>;

  const unit = me?.membership && p.memberPrice != null ? p.memberPrice : p.basePrice;
  const total = p.type === 'RESERVATION' ? unit * headcount : unit;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {p.imageUrl && <Image source={{ uri: img(p.imageUrl, 960) }} style={st.hero} />}
        <Card>
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
            <Tag text={p.type === 'RESERVATION' ? t('typeReservation') : p.type === 'PASS' ? 'PASS' : t('typeTicket')} />
            {p.weatherDependent && <Tag text={t('weather')} tone="warn" />}
            {p.verification !== 'QR_ONLY' && <Tag text={t('staffVerify')} tone="warn" />}
          </View>
          <Text style={st.title}>{p.name}</Text>
          <Text style={st.merchant}>{p.merchant.name} · {p.merchant.address ?? ''}</Text>
          {p.description && <Text style={st.desc}>{p.description}</Text>}

          <View style={st.priceRow}>
            {me?.membership && p.memberPrice != null ? (
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

            <Text style={st.section}>{t('headcount')}</Text>
            <Card>
              <View style={[st.rowBetween, { justifyContent: 'center', gap: 26 }]}>
                <Pressable onPress={() => setHeadcount((h) => Math.max(1, h - 1))}>
                  <Text style={st.stepBtn}>−</Text>
                </Pressable>
                <Text style={st.headcount}>{t('people', { n: headcount })}</Text>
                <Pressable onPress={() => setHeadcount((h) => Math.min(10, h + 1))}>
                  <Text style={st.stepBtn}>＋</Text>
                </Pressable>
              </View>
            </Card>
          </>
        )}

        <View style={{ marginTop: 8 }}>
          <Btn
            title={p.type === 'RESERVATION' ? t('payTotalReserve', { price: won(total) }) : t('payTotal', { price: won(total) })}
            onPress={purchase}
            disabled={busy}
          />
          <Text style={st.note}>
            {p.type === 'RESERVATION' ? t('resvNote') : p.type === 'PASS' ? t('passNote') : t('ticketNote')}
          </Text>
        </View>
      </ScrollView>
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
  stepBtn: { fontSize: 26, fontWeight: '700', color: C.brand, paddingHorizontal: 16 },
  headcount: { fontSize: 20, fontWeight: '700', color: C.ink, minWidth: 60, textAlign: 'center' },
  note: { fontSize: 12, color: C.ink3, textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
