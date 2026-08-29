/**
 * 매장 QR 스캔 결과 — "이 매장에서 지금 쓸 수 있는 것"만 보여주고, 골라서 사용처리.
 */
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { C, won } from '../../lib/theme';
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
        else Alert.alert('사용할 수 없습니다', e.message);
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`"${title}"을(를) 지금 사용할까요?\n직원 앞에서 눌러주세요.`)) await run();
    } else {
      Alert.alert('지금 사용할까요?', `"${title}"\n직원 앞에서 눌러주세요.`, [
        { text: '취소', style: 'cancel' },
        { text: '사용하기', style: 'destructive', onPress: run },
      ]);
    }
  }

  if (error) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <EmptyText text={error} />
          <Btn title="다시 스캔" tone="ghost" onPress={() => router.back()} />
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
          <EmptyText text="이 매장에서 지금 쓸 수 있는 혜택이 없어요.
멤버십을 시작하거나 DROP을 받아보세요." />
        )}

        {data.vouchers.length > 0 && <Text style={st.section}>구매한 이용권</Text>}
        {data.vouchers.map((v) => (
          <Card key={v.id}>
            <Text style={st.itemTitle}>{v.productName}</Text>
            <Text style={st.itemSub}>
              {v.headcount}명 · 코드 {v.code}
              {v.reservedAt ? ` · 예약 ${new Date(v.reservedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
            </Text>
            {v.verification !== 'QR_ONLY' && (
              <View style={{ marginBottom: 8 }}><Tag text="직원 확인 상품" tone="warn" /></View>
            )}
            <Btn title="사용하기" small onPress={() => redeem('VOUCHER', v.id, v.productName)} disabled={busy} />
          </Card>
        ))}

        {data.dropClaims.length > 0 && <Text style={st.section}>받은 DROP 딜</Text>}
        {data.dropClaims.map((d) => (
          <Card key={d.id}>
            <Text style={st.itemTitle}>{d.title}</Text>
            <Text style={st.itemSub}>
              {won(d.dropPrice)} <Text style={{ textDecorationLine: 'line-through' }}>{won(d.normalPrice)}</Text> · {d.qty}개
            </Text>
            {d.blocked ? (
              <Tag text={d.blocked} tone="bad" />
            ) : (
              <Btn title="사용하기" small onPress={() => redeem('DROP', d.id, d.title)} disabled={busy} />
            )}
          </Card>
        ))}

        {data.benefits.length > 0 && <Text style={st.section}>상시 혜택</Text>}
        {data.benefits.map((b) => (
          <Card key={b.id}>
            <Text style={st.itemTitle}>{b.title}</Text>
            <Text style={st.itemSub}>
              {b.companionLimit == null ? '동반 인원 제한 없음' : `동반 ${b.companionLimit}인까지`}
              {b.conditions ? ` · ${b.conditions}` : ''}
            </Text>
            {b.blocked ? (
              <Tag text={b.blocked} tone="bad" />
            ) : (
              <Btn title="사용하기" small onPress={() => redeem('BENEFIT', b.id, b.title)} disabled={busy} />
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
