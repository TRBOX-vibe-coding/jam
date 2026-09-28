/**
 * '가는 날' 고르기 — 2026-09-24 대표 확정(3-2).
 *
 * 티켓·PASS를 살 때 가는 날을 고를 수 있다(안 골라도 된다). 고르면 그날 0시에 딸려 받은 쿠폰이 열리고,
 * 안 고르면 가게에서 이용권을 쓸 때 열린다. 고른 날보다 먼저 가서 쓰면 그 자리에서 바로 열린다.
 * 고른 날은 그날이 오기 전까지 [이용권 · 예약] 화면에서 바꾸거나 지울 수 있다.
 *
 * 날짜는 서버와 'YYYY-MM-DD' 문자열로 주고받는다 — 폰의 시간대와 상관없이 같은 날로 읽게.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from './i18n';
import { C } from './theme';
import { Btn } from './ui';

export type DayRange = { from: string; to: string };

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  return [y, m, d];
}
function keyOf(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}`;
}

/** 'YYYY-MM-DD' → "10월 3일 (토)" (언어에 맞춰) */
export function visitDayText(day: string, locale: string): string {
  const [y, m, d] = parts(day);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'short' });
}

/** 달력 창 — 고르면 onSave(날짜), [아직 몰라요]는 onSave(null) */
export function VisitDateModal({
  visible, value, range, busy, onClose, onSave,
}: {
  visible: boolean;
  value: string | null;
  range: DayRange;
  busy?: boolean;
  onClose: () => void;
  onSave: (day: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const [picked, setPicked] = useState<string | null>(value);
  const [cursor, setCursor] = useState<[number, number]>(() => {
    const [y, m] = parts(value ?? range.from);
    return [y, m];
  });

  // 창을 열 때마다 지금 고른 날로 맞춘다
  useEffect(() => {
    if (!visible) return;
    setPicked(value);
    const [y, m] = parts(value ?? range.from);
    setCursor([y, m]);
  }, [visible, value, range.from]);

  const [cy, cm] = cursor;
  const [fy, fm] = parts(range.from);
  const [ty, tm] = parts(range.to);
  const canPrev = cy * 12 + cm > fy * 12 + fm;
  const canNext = cy * 12 + cm < ty * 12 + tm;
  const move = (step: number) => {
    const n = cy * 12 + (cm - 1) + step;
    setCursor([Math.floor(n / 12), (n % 12) + 1]);
  };

  // 일요일부터 시작하는 달력 칸
  const cells = useMemo(() => {
    const first = new Date(cy, cm - 1, 1).getDay();
    const days = new Date(cy, cm, 0).getDate();
    const out: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) out.push(keyOf(cy, cm, d));
    while (out.length % 7) out.push(null);
    return out;
  }, [cy, cm]);
  // 요일 머리글 — 2024-01-07은 일요일
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'narrow' })),
    [locale],
  );
  const monthLabel = new Date(cy, cm - 1, 1).toLocaleDateString(locale, { year: 'numeric', month: 'long' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.back} onPress={onClose}>
        <Pressable style={st.card} onPress={() => {}}>
          <Text style={st.title}>{t('visitModalTitle')}</Text>
          <Text style={st.sub}>{t('visitModalSub')}</Text>

          <View style={st.monthRow}>
            <Pressable hitSlop={10} disabled={!canPrev} onPress={() => move(-1)} style={!canPrev && { opacity: 0.25 }}>
              <Ionicons name="chevron-back" size={20} color={C.ink2} />
            </Pressable>
            <Text style={st.month}>{monthLabel}</Text>
            <Pressable hitSlop={10} disabled={!canNext} onPress={() => move(1)} style={!canNext && { opacity: 0.25 }}>
              <Ionicons name="chevron-forward" size={20} color={C.ink2} />
            </Pressable>
          </View>

          <View style={st.grid}>
            {weekdays.map((w, i) => (
              <Text key={`w${i}`} style={[st.weekday, i === 0 && { color: C.bad }]}>{w}</Text>
            ))}
            {cells.map((day, i) => {
              if (!day) return <View key={`e${i}`} style={st.cell} />;
              const off = day < range.from || day > range.to;
              const on = day === picked;
              const today = day === range.from;
              return (
                <Pressable key={day} style={st.cell} disabled={off} onPress={() => setPicked(day)}>
                  <View style={[st.dayBox, on && st.dayOn, !on && today && st.dayToday]}>
                    <Text style={[st.day, off && st.dayOff, on && st.dayOnText]}>{parts(day)[2]}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={st.picked}>
            {picked ? t('visitChosen', { date: visitDayText(picked, locale) }) : t('visitNone')}
          </Text>
          <Btn title={t('visitSave')} onPress={() => picked && onSave(picked)} disabled={!picked || busy || picked === value} />
          <View style={st.footer}>
            {value && (
              <Pressable hitSlop={8} disabled={busy} onPress={() => onSave(null)}>
                <Text style={st.clear}>{t('visitClear')}</Text>
              </Pressable>
            )}
            <Pressable hitSlop={8} onPress={onClose}>
              <Text style={st.close}>{t('close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(10,20,30,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: C.white, borderRadius: 18, padding: 20, width: '100%', maxWidth: 380 },
  title: { fontSize: 18, fontWeight: '800', color: C.ink, textAlign: 'center' },
  sub: { fontSize: 12.5, color: C.ink2, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6, paddingHorizontal: 6 },
  month: { fontSize: 15, fontWeight: '800', color: C.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '700', color: C.ink3, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  dayBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.brand },
  dayToday: { borderWidth: 1, borderColor: C.brand },
  day: { fontSize: 14, fontWeight: '700', color: C.ink },
  dayOff: { color: '#C3CCD5', fontWeight: '500' },
  dayOnText: { color: '#fff' },
  picked: { fontSize: 13.5, fontWeight: '800', color: C.brand, textAlign: 'center', marginTop: 10, marginBottom: 10 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 12 },
  clear: { fontSize: 13, fontWeight: '700', color: C.bad },
  close: { fontSize: 13, fontWeight: '600', color: C.ink3 },
});
