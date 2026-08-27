/** 작은 공용 컴포넌트 모음 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from './theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={s.screen}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Chip({
  label, active, onPress,
}: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ text, tone = 'brand' }: { text: string; tone?: 'brand' | 'ok' | 'warn' | 'bad' | 'gold' }) {
  const bg = { brand: C.brandSoft, ok: C.okSoft, warn: C.warnSoft, bad: C.badSoft, gold: '#F6EBD4' }[tone];
  const fg = { brand: C.brand, ok: C.ok, warn: C.warn, bad: C.bad, gold: C.gold }[tone];
  return (
    <View style={[s.tag, { backgroundColor: bg }]}>
      <Text style={[s.tagText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Btn({
  title, onPress, tone = 'primary', disabled, small,
}: {
  title: string; onPress?: () => void;
  tone?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        tone === 'ghost' && s.btnGhost,
        tone === 'danger' && s.btnDanger,
        (disabled || pressed) && { opacity: disabled ? 0.4 : 0.85 },
      ]}
    >
      <Text style={[s.btnText, small && { fontSize: 13 }, tone === 'ghost' && { color: C.ink2 }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

export function EmptyText({ text }: { text: string }) {
  return <Text style={{ color: C.ink3, textAlign: 'center', padding: 32, fontSize: 14 }}>{text}</Text>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  card: {
    backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line,
    padding: 14, marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginRight: 7,
  },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontSize: 13, color: C.ink2, fontWeight: '600' },
  chipTextActive: { color: C.white },
  tag: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 5, alignSelf: 'flex-start' },
  tagText: { fontSize: 11, fontWeight: '700' },
  btn: {
    backgroundColor: C.brand, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14 },
  btnGhost: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  btnDanger: { backgroundColor: C.bad },
  btnText: { color: C.white, fontWeight: '700', fontSize: 15 },
});
