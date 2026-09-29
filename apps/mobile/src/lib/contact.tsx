/**
 * 연락처 — 돈을 내고 사는 상품(티켓·예약·기획전 상품)은 손님 휴대폰 번호를 받는다 (2026-09-29 사용자 결정).
 * 가게가 예약 확인·날씨로 인한 취소 같은 일이 있을 때 전화하려고 쓴다. 산 상품의 가게에만 보인다.
 * 한 번 넣은 번호는 회원 정보에 남아 다음 결제 때 저절로 채워진다. 가게에 알려 주는 데는 결제마다 동의를 받는다.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from './i18n';
import { C } from './theme';
import { Card } from './ui';

/** 숫자만 받아 010-1234-5678 모양으로 */
export function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

/** 휴대폰 번호인지 (010·011·016~019) */
export const validPhone = (v: string) => /^01[016789]-\d{3,4}-\d{4}$/.test(v);

export function ContactCard({
  phone, onPhone, agree, onAgree, storeName,
}: {
  phone: string; onPhone: (v: string) => void; agree: boolean; onAgree: (v: boolean) => void; storeName: string;
}) {
  const { t } = useI18n();
  const bad = phone.length >= 12 && !validPhone(phone);
  return (
    <>
      <Text style={st.section}>{t('contactTitle')}</Text>
      <Card>
        <TextInput
          value={phone}
          onChangeText={(v) => onPhone(formatPhone(v))}
          placeholder="010-1234-5678"
          placeholderTextColor={C.ink3}
          keyboardType="phone-pad"
          maxLength={13}
          style={[st.input, bad && { borderColor: C.bad }]}
        />
        <Text style={st.guide}>{bad ? t('contactInvalid') : t('contactGuide', { store: storeName })}</Text>
        <Pressable style={st.agreeRow} onPress={() => onAgree(!agree)} hitSlop={6}>
          <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={20} color={agree ? C.brand : C.ink3} />
          <Text style={st.agreeText}>{t('contactAgree', { store: storeName })}</Text>
        </Pressable>
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  // 상품 화면의 다른 칸 제목과 같은 모양
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 12, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 16, color: C.ink, backgroundColor: C.white, letterSpacing: 0.5,
  },
  guide: { fontSize: 12, color: C.ink3, marginTop: 7, lineHeight: 17 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  agreeText: { flex: 1, fontSize: 12.5, color: C.ink2, lineHeight: 18, fontWeight: '600' },
});
