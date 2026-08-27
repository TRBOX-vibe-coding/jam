/**
 * 사용 완료 화면 — 직원에게 보여주는 화면.
 * 캡처 재사용을 막기 위해 ①실시간 시계(초 단위) ②90초 카운트다운 ③6자리 검증코드를 함께 표시한다.
 * 직원은 초가 흘러가는지만 보면 되고, 고가 상품은 가맹점 모드에서 코드를 조회해 확인한다.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C, won } from '../lib/theme';
import { Btn, Screen } from '../lib/ui';

export default function DoneScreen() {
  const p = useLocalSearchParams<{
    merchantName: string; itemTitle: string; savedAmount: string; verifyToken: string; staff: string;
  }>();
  const [now, setNow] = useState(new Date());
  const [left, setLeft] = useState(90);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      setLeft((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('ko-KR', { hour12: false });
  const saved = Number(p.savedAmount || 0);

  return (
    <Screen>
      <View style={st.wrap}>
        <View style={[st.badge, left === 0 && { backgroundColor: C.ink3 }]}>
          <Text style={st.badgeText}>{left > 0 ? '사용 완료' : '표시 만료'}</Text>
        </View>

        <Text style={st.merchant}>{p.merchantName}</Text>
        <Text style={st.item}>{p.itemTitle}</Text>

        {/* 실시간 시계 — 캡처와 구분되는 핵심 요소 */}
        <Text style={st.clock}>{clock}</Text>
        <View style={st.pulseRow}>
          <View style={[st.dot, { opacity: now.getSeconds() % 2 ? 1 : 0.2 }]} />
          <Text style={st.live}>실시간 화면 · {left}초</Text>
        </View>

        <View style={st.tokenBox}>
          <Text style={st.tokenLabel}>직원 확인 코드</Text>
          <Text style={st.token}>{p.verifyToken}</Text>
        </View>

        {saved > 0 && (
          <Text style={st.saved}>이번에 {won(saved)} 아꼈어요 🎉</Text>
        )}
        {p.staff === '1' && (
          <Text style={st.staffNote}>이 상품은 직원이 코드를 확인한 후 이용할 수 있어요.</Text>
        )}

        <View style={{ marginTop: 28, width: '100%' }}>
          <Btn title="확인" onPress={() => router.replace('/(tabs)')} />
        </View>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  badge: { backgroundColor: C.ok, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7 },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  merchant: { fontSize: 22, fontWeight: '900', color: C.ink, marginTop: 18 },
  item: { fontSize: 14, color: C.ink2, marginTop: 4, textAlign: 'center' },
  clock: {
    fontSize: 44, fontWeight: '900', color: C.brand, marginTop: 20,
    fontVariant: ['tabular-nums'], letterSpacing: 1,
  },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.bad },
  live: { fontSize: 12, color: C.ink3, fontWeight: '600' },
  tokenBox: {
    marginTop: 22, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.brand,
    borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center',
  },
  tokenLabel: { fontSize: 11, color: C.ink3, fontWeight: '700' },
  token: { fontSize: 30, fontWeight: '900', color: C.ink, letterSpacing: 6, marginTop: 2 },
  saved: { marginTop: 18, fontSize: 15, fontWeight: '800', color: C.ok },
  staffNote: { marginTop: 8, fontSize: 12, color: C.warn, fontWeight: '600', textAlign: 'center' },
});
