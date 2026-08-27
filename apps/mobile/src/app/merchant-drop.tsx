/**
 * 점주 DROP 등록 — "수량·시간을 점주가 직접 통제한다"는 제안서 원칙의 실행 화면.
 * 날짜 선택기 대신 프리셋 버튼으로 30초 안에 등록을 끝낸다. 등록 즉시 본사 승인 대기.
 */
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { C, won } from '../lib/theme';
import { Btn, Card, Screen } from '../lib/ui';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

const START_PRESETS = [
  { key: 'now', label: '지금 바로', calc: () => new Date() },
  {
    key: 'tomorrow10',
    label: '내일 오전 10시',
    calc: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d;
    },
  },
];
const DURATION_PRESETS = [
  { key: '6h', label: '6시간', hours: 6 },
  { key: '12h', label: '12시간', hours: 12 },
  { key: '24h', label: '오늘 하루', hours: 24 },
  { key: '48h', label: '이틀', hours: 48 },
];
const USE_TIME_PRESETS = [
  { key: 'all', label: '제한 없음', from: null as number | null, to: null as number | null },
  { key: 'break', label: '14~17시', from: 14 * 60, to: 17 * 60 },
  { key: 'evening', label: '18~22시', from: 18 * 60, to: 22 * 60 },
];

export default function MerchantDropCreate() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [normalPrice, setNormalPrice] = useState('');
  const [dropPrice, setDropPrice] = useState('');
  const [totalQty, setTotalQty] = useState('20');
  const [persons, setPersons] = useState(1);
  const [startKey, setStartKey] = useState('now');
  const [durKey, setDurKey] = useState('24h');
  const [useKey, setUseKey] = useState('all');
  const [busy, setBusy] = useState(false);

  const normal = Number(normalPrice.replace(/\D/g, '')) || 0;
  const drop = Number(dropPrice.replace(/\D/g, '')) || 0;
  const qty = Number(totalQty.replace(/\D/g, '')) || 0;
  const rate = normal > 0 && drop > 0 && drop < normal ? Math.round((1 - drop / normal) * 100) : null;

  /** 점주가 등록 전에 손실 한도를 눈으로 확인한다 — "공급자 통제" 원칙 */
  const maxDiscountTotal = useMemo(
    () => (rate != null && qty > 0 ? (normal - drop) * qty : null),
    [rate, normal, drop, qty],
  );

  const valid = title.trim().length >= 4 && rate != null && qty >= 1;

  async function submit() {
    if (!valid) return;
    const start = START_PRESETS.find((p) => p.key === startKey)!.calc();
    const hours = DURATION_PRESETS.find((p) => p.key === durKey)!.hours;
    const close = new Date(start.getTime() + hours * 3600_000);
    const use = USE_TIME_PRESETS.find((p) => p.key === useKey)!;

    setBusy(true);
    try {
      const r = await api<{ message: string }>('/merchant/my/drops', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          kind: 'DEAL',
          normalPrice: normal,
          dropPrice: drop,
          totalQty: qty,
          personsPerUnit: persons,
          openAt: start.toISOString(),
          closeAt: close.toISOString(),
          usableFromMinute: use.from ?? undefined,
          usableToMinute: use.to ?? undefined,
        },
      });
      notify('등록 요청 완료', r.message);
      router.back();
    } catch (e: any) {
      notify('등록할 수 없습니다', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ backgroundColor: C.brandSoft, borderColor: C.brandSoft }}>
          <Text style={st.guide}>
            비는 시간·남는 재고만 수량을 정해 파세요.{'\n'}등록하면 본사 승인 후 고객에게 열립니다.
          </Text>
        </Card>

        <Text style={st.label}>딜 제목</Text>
        <TextInput
          style={st.input}
          value={title}
          onChangeText={setTitle}
          placeholder="예) 평일 브런치 2인 세트 34% 할인"
          placeholderTextColor={C.ink3}
        />

        <Text style={st.label}>설명 (선택)</Text>
        <TextInput
          style={[st.input, { height: 70 }]}
          value={description}
          onChangeText={setDescription}
          placeholder="구성·조건을 적어주세요"
          placeholderTextColor={C.ink3}
          multiline
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>정상가</Text>
            <TextInput
              style={st.input} value={normalPrice} onChangeText={setNormalPrice}
              placeholder="32000" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>딜 가격</Text>
            <TextInput
              style={st.input} value={dropPrice} onChangeText={setDropPrice}
              placeholder="21000" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
        </View>
        {rate != null && (
          <Text style={st.rateLine}>
            할인율 <Text style={{ color: '#E8503A', fontWeight: '900' }}>{rate}%</Text>
            {maxDiscountTotal != null && (
              <Text style={{ color: C.ink3 }}>  ·  전량 판매 시 총 할인 {won(maxDiscountTotal)}</Text>
            )}
          </Text>
        )}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>수량 (한정)</Text>
            <TextInput
              style={st.input} value={totalQty} onChangeText={setTotalQty}
              keyboardType="number-pad" placeholderTextColor={C.ink3}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>1개당 인원</Text>
            <View style={st.stepper}>
              <Pressable onPress={() => setPersons((p) => Math.max(1, p - 1))}>
                <Text style={st.stepBtn}>−</Text>
              </Pressable>
              <Text style={st.stepVal}>{persons}인</Text>
              <Pressable onPress={() => setPersons((p) => Math.min(10, p + 1))}>
                <Text style={st.stepBtn}>＋</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={st.label}>오픈 시점</Text>
        <View style={st.presetRow}>
          {START_PRESETS.map((p) => (
            <Pressable key={p.key} style={[st.preset, startKey === p.key && st.presetOn]} onPress={() => setStartKey(p.key)}>
              <Text style={[st.presetText, startKey === p.key && st.presetTextOn]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={st.label}>판매 기간</Text>
        <View style={st.presetRow}>
          {DURATION_PRESETS.map((p) => (
            <Pressable key={p.key} style={[st.preset, durKey === p.key && st.presetOn]} onPress={() => setDurKey(p.key)}>
              <Text style={[st.presetText, durKey === p.key && st.presetTextOn]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={st.label}>매장 사용 가능 시간</Text>
        <View style={st.presetRow}>
          {USE_TIME_PRESETS.map((p) => (
            <Pressable key={p.key} style={[st.preset, useKey === p.key && st.presetOn]} onPress={() => setUseKey(p.key)}>
              <Text style={[st.presetText, useKey === p.key && st.presetTextOn]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 18 }}>
          <Btn
            title={busy ? '등록 중…' : '등록 요청 (본사 승인 후 오픈)'}
            onPress={submit}
            disabled={!valid || busy}
          />
        </View>
        <Text style={st.foot}>승인 결과는 가맹점 모드의 내 DROP에서 확인할 수 있어요.</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 13.5, color: C.brand, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  label: { fontSize: 12.5, fontWeight: '800', color: C.ink3, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 11,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: C.ink,
  },
  rateLine: { marginTop: 8, fontSize: 13.5, fontWeight: '700', color: C.ink },
  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  stepBtn: { fontSize: 22, fontWeight: '900', color: C.brand, paddingHorizontal: 8 },
  stepVal: { fontSize: 15, fontWeight: '800', color: C.ink },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
  },
  presetOn: { backgroundColor: C.brand, borderColor: C.brand },
  presetText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  presetTextOn: { color: '#fff' },
  foot: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 12, marginBottom: 20 },
});
