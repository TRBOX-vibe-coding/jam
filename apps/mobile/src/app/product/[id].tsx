/**
 * 상품 상세 — 예약형은 날짜·시간·인원 선택 → 결제 → 예약확정까지 앱 안에서 끝낸다.
 */
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { C, won } from '../../lib/theme';
import { Btn, Card, Loading, Screen, Tag } from '../../lib/ui';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const [p, setP] = useState<any | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState(1);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<any>(`/products/${id}`).then(setP).catch(() => {});
    }, [id]),
  );

  async function purchase() {
    if (!me) {
      router.push('/(tabs)/my');
      return;
    }
    if (p.type === 'RESERVATION' && !slotId) {
      notify('예약 시간', '이용할 시간을 선택해 주세요');
      return;
    }
    setBusy(true);
    try {
      const r = await api<any>(`/products/${id}/purchase`, {
        method: 'POST',
        body: { slotId: slotId ?? undefined, headcount, contactName: me.nickname },
      });
      notify('완료', r.message);
      router.push('/wallet');
    } catch (e: any) {
      notify('구매할 수 없습니다', e.message);
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
            <Tag text={p.type === 'RESERVATION' ? '예약형' : p.type === 'PASS' ? 'PASS' : '티켓'} />
            {p.weatherDependent && <Tag text="기상 영향" tone="warn" />}
            {p.verification !== 'QR_ONLY' && <Tag text="직원 확인" tone="warn" />}
          </View>
          <Text style={st.title}>{p.name}</Text>
          <Text style={st.merchant}>{p.merchant.name} · {p.merchant.address ?? ''}</Text>
          {p.description && <Text style={st.desc}>{p.description}</Text>}

          <View style={st.priceRow}>
            {me?.membership && p.memberPrice != null ? (
              <>
                <Tag text="멤버십가" tone="gold" />
                <Text style={st.price}>{won(p.memberPrice)}</Text>
                <Text style={st.normal}>{won(p.basePrice)}</Text>
              </>
            ) : (
              <>
                <Text style={st.price}>{won(p.basePrice)}</Text>
                {p.memberPrice != null && (
                  <Text style={st.memberHint}>멤버십 회원은 {won(p.memberPrice)}</Text>
                )}
              </>
            )}
          </View>
          {p.cancelPolicy && <Text style={st.policy}>· {p.cancelPolicy}</Text>}
        </Card>

        {p.type === 'RESERVATION' && (
          <>
            <Text style={st.section}>시간 선택</Text>
            {p.slots.length === 0 && <Card><Text style={st.noSlot}>예약 가능한 시간이 없습니다</Text></Card>}
            {p.slots.map((s: any) => {
              const label = new Date(s.startAt).toLocaleString('ko-KR', {
                month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
              });
              const disabled = s.remaining < headcount;
              return (
                <Pressable key={s.id} onPress={() => !disabled && setSlotId(s.id)}>
                  <Card style={slotId === s.id ? { borderColor: C.brand, borderWidth: 2 } : undefined}>
                    <View style={st.rowBetween}>
                      <Text style={[st.slotLabel, disabled && { color: C.ink3 }]}>{label}</Text>
                      <Text style={[st.slotRemain, disabled && { color: C.bad }]}>
                        {disabled ? '마감' : `${s.remaining}자리`}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })}

            <Text style={st.section}>인원</Text>
            <Card>
              <View style={[st.rowBetween, { justifyContent: 'center', gap: 26 }]}>
                <Pressable onPress={() => setHeadcount((h) => Math.max(1, h - 1))}>
                  <Text style={st.stepBtn}>−</Text>
                </Pressable>
                <Text style={st.headcount}>{headcount}명</Text>
                <Pressable onPress={() => setHeadcount((h) => Math.min(10, h + 1))}>
                  <Text style={st.stepBtn}>＋</Text>
                </Pressable>
              </View>
            </Card>
          </>
        )}

        <View style={{ marginTop: 8 }}>
          <Btn
            title={`${won(total)} 결제하기${p.type === 'RESERVATION' ? ' · 예약 확정' : ''}`}
            onPress={purchase}
            disabled={busy}
          />
          <Text style={st.note}>
            {p.type === 'RESERVATION'
              ? '결제와 동시에 예약이 확정됩니다. 전화 예약이 필요 없어요.'
              : p.type === 'PASS'
                ? '결제하면 이용권과 함께 지역 로컬 혜택이 자동으로 열립니다.'
                : '결제하면 이용권이 발급됩니다. 매장에서 QR 스캔으로 사용하세요.'}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { width: '100%', height: 190, borderRadius: 16, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '900', color: C.ink, lineHeight: 27 },
  merchant: { fontSize: 13, color: C.ink3, marginTop: 4 },
  desc: { fontSize: 14, color: C.ink2, marginTop: 10, lineHeight: 21 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  price: { fontSize: 24, fontWeight: '900', color: C.ink },
  normal: { fontSize: 14, color: C.ink3, textDecorationLine: 'line-through' },
  memberHint: { fontSize: 12, color: C.gold, fontWeight: '700' },
  policy: { fontSize: 12, color: C.warn, marginTop: 8 },
  section: { fontSize: 13, fontWeight: '800', color: C.ink3, marginTop: 12, marginBottom: 8 },
  noSlot: { fontSize: 13, color: C.ink3, textAlign: 'center' },
  slotLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  slotRemain: { fontSize: 13, fontWeight: '800', color: C.brand },
  stepBtn: { fontSize: 26, fontWeight: '900', color: C.brand, paddingHorizontal: 16 },
  headcount: { fontSize: 20, fontWeight: '900', color: C.ink, minWidth: 60, textAlign: 'center' },
  note: { fontSize: 12, color: C.ink3, textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
