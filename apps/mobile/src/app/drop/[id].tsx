/** DROP 상세 — 받기(DEAL) 또는 바로 결제(TICKET) */
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { C, won } from '../../lib/theme';
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
  const [d, setD] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<any>(`/drops/${id}`).then(setD).catch(() => {});
    }, [id]),
  );

  async function claim() {
    if (!me) {
      router.push('/(tabs)/my');
      return;
    }
    setBusy(true);
    try {
      const r = await api<any>(`/drops/${id}/claim`, { method: 'POST', body: {} });
      notify(r.type === 'TICKET' ? '결제 완료' : '받았습니다!', r.message);
      if (r.type === 'TICKET') router.push('/wallet');
      else router.back();
    } catch (e: any) {
      notify('받을 수 없습니다', e.message);
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
            {d.audience === 'MEMBER_ONLY' && <Tag text="멤버 전용" tone="gold" />}
            {d.isSponsored && <Tag text="광고" tone="warn" />}
            <Tag text={d.kind === 'TICKET' ? '앱에서 결제' : '현장 결제 딜'} tone="ok" />
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
            <Text style={st.info}>· 남은 수량 {d.remainingQty} / {d.totalQty}</Text>
            <Text style={st.info}>· 1개 = {d.personsPerUnit}인 기준</Text>
            <Text style={st.info}>· 마감 {new Date(d.closeAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
            {d.usableFromMinute != null && (
              <Text style={st.info}>· 사용 가능 시간 {fmtMin(d.usableFromMinute)}~{fmtMin(d.usableToMinute)}</Text>
            )}
            {d.maxPerUser && <Text style={st.info}>· 1인당 최대 {d.maxPerUser}개</Text>}
          </View>
        </Card>

        {d.locked ? (
          <Card style={{ backgroundColor: C.warnSoft, borderColor: C.warnSoft }}>
            <Text style={st.lockText}>멤버십 회원 전용 DROP입니다</Text>
            <Btn title="멤버십 알아보기" onPress={() => router.push('/(tabs)/my')} />
          </Card>
        ) : (
          <Btn
            title={
              soldOut ? '품절' :
              d.kind === 'TICKET' ? `${won(d.dropPrice)} 결제하고 받기` : '이 딜 받기 (무료)'
            }
            onPress={claim}
            disabled={busy || soldOut}
          />
        )}
        <Text style={st.note}>
          {d.kind === 'TICKET'
            ? '결제하면 이용권이 바로 발급됩니다. 매장에서 QR 스캔으로 사용하세요.'
            : '받아두면 [사용] 탭에서 매장 QR을 스캔해 할인받을 수 있어요.'}
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
