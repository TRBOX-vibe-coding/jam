/**
 * 결제 전 취소·환불 안내 — 2026-09-28 대표 확정.
 *
 * 숫자(결제 직후 몇 분, 하루 전 몇 %, 몇 개월)는 본사 관리 웹 '설정 → 취소·환불 규정'에서 바꾼다.
 * 여기서는 그 값을 읽어 문장으로 보여주기만 한다. 지금(C 방식)은 손님이 앱에서 직접 취소하지 않고,
 * 적힌 곳으로 요청하면 본사가 처리한다.
 */
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from './api';
import { useI18n } from './i18n';
import { C } from './theme';

type Policy = {
  graceMinutes: number;
  sameDayPercent: number;
  dayBeforePercent: number;
  twoDaysBeforePercent: number;
  undatedMonths: number;
  csContact: string;
  csLink: string;
};

// 화면마다 다시 부르지 않게 한 번 읽은 값을 둔다
let cached: Policy | null = null;
let inflight: Promise<Policy | null> | null = null;
function loadPolicy(): Promise<Policy | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api<Policy>('/policy/refund')
      .then((p) => (cached = p))
      .catch(() => null)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function RefundNotice({ kind, hasBundled }: {
  kind: 'RESERVATION' | 'TICKET' | 'PASS' | 'JAM';
  hasBundled?: boolean;
}) {
  const { t } = useI18n();
  const [p, setP] = useState<Policy | null>(cached);

  useEffect(() => {
    let alive = true;
    loadPolicy().then((x) => { if (alive && x) setP(x); });
    return () => { alive = false; };
  }, []);

  if (!p) return null;

  const pct = (n: number) => (n >= 100 ? t('rfFull') : n <= 0 ? t('rfNone') : t('rfPct', { n }));
  const lines: string[] = [];
  if (kind === 'RESERVATION') {
    lines.push(t('rfResv', { a: pct(p.twoDaysBeforePercent), b: pct(p.dayBeforePercent), c: pct(p.sameDayPercent) }));
  }
  if (kind === 'TICKET' || kind === 'PASS') lines.push(t('rfUndated', { n: p.undatedMonths }));
  if (kind === 'JAM') lines.push(t('rfJam'));
  if (p.graceMinutes > 0) lines.push(t('rfGrace', { n: p.graceMinutes }));
  if (kind !== 'JAM') lines.push(t('rfUsed'));
  if (hasBundled) lines.push(t('rfBundled'));

  const cs = p.csContact?.trim() || t('rfCsDefault');
  const link = p.csLink?.trim();

  return (
    <View style={st.box}>
      <Text style={st.title}>{t('rfTitle')}</Text>
      {lines.map((l, i) => (
        <View key={i} style={st.row}>
          <Text style={st.dot}>·</Text>
          <Text style={st.line}>{l}</Text>
        </View>
      ))}
      <Pressable disabled={!link} onPress={() => link && Linking.openURL(link)} style={st.csRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={link ? C.brand : C.ink3} />
        <Text style={[st.cs, link ? st.csLink : null]}>{t('rfHow', { cs })}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  box: { backgroundColor: C.ground, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginTop: 14 },
  title: { fontSize: 13, fontWeight: '700', color: C.ink2, marginBottom: 5 },
  row: { flexDirection: 'row', gap: 5, marginTop: 2 },
  dot: { fontSize: 12, color: C.ink3, lineHeight: 18 },
  line: { flex: 1, fontSize: 12, color: C.ink2, lineHeight: 18 },
  csRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line },
  cs: { fontSize: 12, color: C.ink3 },
  csLink: { color: C.brand, fontWeight: '700' },
});
