/**
 * 점주 혜택(할인쿠폰) 등록 — 멤버십 회원에게 상시 노출되는 혜택을 점주가 직접 올린다.
 * 등록 즉시 본사 승인 대기, 승인되면 유효한 멤버십 회원 전원에게 자동으로 열린다.
 */
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { C } from '../lib/theme';
import { Btn, Card, Screen } from '../lib/ui';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

const TYPES = [
  { key: 'PERCENT', label: '% 할인', desc: '주문 금액에서 비율 할인 (예: 20%)' },
  { key: 'AMOUNT', label: '금액 할인', desc: '정해진 금액을 깎아주기 (예: 3,000원)' },
  { key: 'FREEBIE', label: '증정', desc: '무언가를 무료로 드리기 (예: 아메리카노 1잔)' },
] as const;

export default function MerchantBenefitCreate() {
  const [type, setType] = useState<'PERCENT' | 'AMOUNT' | 'FREEBIE'>('PERCENT');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [freebieName, setFreebieName] = useState('');
  const [companionLimit, setCompanionLimit] = useState('');
  const [maxUsePerUser, setMaxUsePerUser] = useState('');
  const [maxUsePerDay, setMaxUsePerDay] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [conditions, setConditions] = useState('');
  const [busy, setBusy] = useState(false);

  const num = (s: string) => Number(s.replace(/\D/g, '')) || 0;
  const valid =
    title.trim().length >= 2 &&
    (type === 'FREEBIE' ? freebieName.trim().length >= 1 : num(value) >= 1) &&
    (type !== 'PERCENT' || num(value) <= 100);

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/merchant/my/benefits', {
        method: 'POST',
        body: {
          title: title.trim(),
          type,
          value: type === 'FREEBIE' ? undefined : num(value),
          freebieName: type === 'FREEBIE' ? freebieName.trim() : undefined,
          companionLimit: num(companionLimit) || undefined,
          maxUsePerUser: num(maxUsePerUser) || undefined,
          maxUsePerDay: num(maxUsePerDay) || undefined,
          minOrderAmount: num(minOrderAmount) || undefined,
          conditions: conditions.trim() || undefined,
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
            멤버십 회원에게 상시로 열리는 혜택입니다.{'\n'}본사 승인 후 회원들의 혜택함에 자동으로 들어가요.
          </Text>
        </Card>

        <Text style={st.label}>혜택 방식</Text>
        {TYPES.map((t) => (
          <Pressable
            key={t.key}
            style={[st.typeCard, type === t.key && st.typeCardOn]}
            onPress={() => setType(t.key)}
          >
            <Text style={[st.typeLabel, type === t.key && { color: C.brand }]}>{t.label}</Text>
            <Text style={st.typeDesc}>{t.desc}</Text>
          </Pressable>
        ))}

        <Text style={st.label}>혜택 이름</Text>
        <TextInput
          style={st.input}
          value={title}
          onChangeText={setTitle}
          placeholder={
            type === 'PERCENT' ? '예) 전 메뉴 20% 할인'
            : type === 'AMOUNT' ? '예) 3,000원 즉시 할인'
            : '예) 아메리카노 1잔 무료'
          }
          placeholderTextColor={C.ink3}
        />

        {type === 'FREEBIE' ? (
          <>
            <Text style={st.label}>증정품 이름</Text>
            <TextInput
              style={st.input} value={freebieName} onChangeText={setFreebieName}
              placeholder="예) 아메리카노" placeholderTextColor={C.ink3}
            />
          </>
        ) : (
          <>
            <Text style={st.label}>{type === 'PERCENT' ? '할인율 (%)' : '할인 금액 (원)'}</Text>
            <TextInput
              style={st.input} value={value} onChangeText={setValue}
              placeholder={type === 'PERCENT' ? '20' : '3000'}
              placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </>
        )}

        <Text style={st.section}>사용 조건 (선택 — 비워두면 제한 없음)</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>동반 인원까지</Text>
            <TextInput
              style={st.input} value={companionLimit} onChangeText={setCompanionLimit}
              placeholder="예: 3" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>최소 주문금액</Text>
            <TextInput
              style={st.input} value={minOrderAmount} onChangeText={setMinOrderAmount}
              placeholder="예: 10000" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>1인당 총 횟수</Text>
            <TextInput
              style={st.input} value={maxUsePerUser} onChangeText={setMaxUsePerUser}
              placeholder="예: 5" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>하루 최대 횟수</Text>
            <TextInput
              style={st.input} value={maxUsePerDay} onChangeText={setMaxUsePerDay}
              placeholder="예: 1" placeholderTextColor={C.ink3} keyboardType="number-pad"
            />
          </View>
        </View>

        <Text style={st.label}>기타 조건 메모</Text>
        <TextInput
          style={[st.input, { height: 60 }]}
          value={conditions}
          onChangeText={setConditions}
          placeholder="예) 주말 공휴일 제외, 다른 쿠폰과 중복 불가"
          placeholderTextColor={C.ink3}
          multiline
        />

        <View style={{ marginTop: 18 }}>
          <Btn
            title={busy ? '등록 중…' : '등록 요청 (본사 승인 후 적용)'}
            onPress={submit}
            disabled={!valid || busy}
          />
        </View>
        <Text style={st.foot}>승인 결과는 가맹점 모드의 내 혜택에서 확인할 수 있어요.</Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 13.5, color: C.brand, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 18 },
  label: { fontSize: 12.5, fontWeight: '700', color: C.ink3, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 11,
    paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: C.ink,
  },
  typeCard: {
    backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8,
  },
  typeCardOn: { borderColor: C.brand, backgroundColor: C.brandSoft },
  typeLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  typeDesc: { fontSize: 12, color: C.ink3, marginTop: 2 },
  foot: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 12, marginBottom: 20 },
});
