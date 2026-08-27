/** 이용권 · 예약 · 받은 딜을 한 곳에서 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { C, won } from '../../lib/theme';
import { Btn, Card, EmptyText, Loading, Screen, Tag } from '../../lib/ui';

const VSTATUS: Record<string, { label: string; tone: 'ok' | 'brand' | 'bad' | 'warn' }> = {
  ISSUED: { label: '사용 가능', tone: 'ok' },
  RESERVED: { label: '예약됨', tone: 'brand' },
  USED: { label: '사용 완료', tone: 'warn' },
  EXPIRED: { label: '기간 만료', tone: 'bad' },
  CANCELLED: { label: '취소됨', tone: 'bad' },
};
const CSTATUS: Record<string, { label: string; tone: 'ok' | 'brand' | 'bad' | 'warn' }> = {
  CLAIMED: { label: '사용 가능', tone: 'ok' },
  RESERVED: { label: '결제됨', tone: 'brand' },
  USED: { label: '사용 완료', tone: 'warn' },
  EXPIRED: { label: '기간 만료', tone: 'bad' },
  CANCELLED: { label: '취소됨', tone: 'bad' },
  REFUNDED: { label: '환불됨', tone: 'bad' },
};

export default function WalletScreen() {
  const { me } = useAuth();
  const [vouchers, setVouchers] = useState<any[] | null>(null);
  const [claims, setClaims] = useState<any[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      api<any[]>('/me/vouchers').then(setVouchers).catch(() => setVouchers([]));
      api<any[]>('/me/claims').then(setClaims).catch(() => setClaims([]));
    }, [me]),
  );

  if (!me) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <EmptyText text="로그인하면 이용권과 예약이 여기에 보여요" />
          <Btn title="로그인하러 가기" onPress={() => router.push('/my')} />
        </View>
      </Screen>
    );
  }
  if (!vouchers || !claims) return <Screen><Loading /></Screen>;

  const deals = claims.filter((c) => c.drop.kind === 'DEAL');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={st.section}>이용권 · 예약</Text>
        {vouchers.length === 0 && <EmptyText text="구매한 이용권이 없어요" />}
        {vouchers.map((v) => {
          const stt = VSTATUS[v.status] ?? { label: v.status, tone: 'warn' as const };
          return (
            <Card key={v.id}>
              <View style={st.rowBetween}>
                <Text style={st.title}>{v.product.name}</Text>
                <Tag text={stt.label} tone={stt.tone} />
              </View>
              <Text style={st.sub}>{v.product.merchant.name} · {v.headcount}명</Text>
              {v.reservation && (
                <Text style={st.reserve}>
                  📅 {new Date(v.reservation.slot.startAt).toLocaleString('ko-KR', {
                    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })} 예약 확정
                </Text>
              )}
              <Text style={st.code}>코드 {v.code} · ~{new Date(v.validTo).toLocaleDateString('ko-KR')}</Text>
            </Card>
          );
        })}

        <Text style={[st.section, { marginTop: 14 }]}>받은 DROP 딜</Text>
        {deals.length === 0 && <EmptyText text="받아둔 딜이 없어요. 오늘 탭에서 확인해 보세요." />}
        {deals.map((c) => {
          const stt = CSTATUS[c.status] ?? { label: c.status, tone: 'warn' as const };
          return (
            <Card key={c.id}>
              <View style={st.rowBetween}>
                <Text style={st.title}>{c.drop.title}</Text>
                <Tag text={stt.label} tone={stt.tone} />
              </View>
              <Text style={st.sub}>
                {c.drop.merchant.name} · {won(c.drop.dropPrice)}{' '}
                <Text style={{ textDecorationLine: 'line-through' }}>{won(c.drop.normalPrice)}</Text>
              </Text>
              <Text style={st.code}>~{new Date(c.validTo).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 까지 사용</Text>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', color: C.ink3, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: C.ink, flex: 1 },
  sub: { fontSize: 13, color: C.ink2, marginTop: 4 },
  reserve: { fontSize: 13, color: C.brand, fontWeight: '700', marginTop: 6 },
  code: { fontSize: 11, color: C.ink3, marginTop: 6 },
});
