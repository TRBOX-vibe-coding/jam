/**
 * 결제 정보 — 2026-09-29 사용자 결정: "결제 시 기본적으로 넣어야 하는 정보는 해야 됨", "고객 연락처는 있어야 됨".
 * 결제하는 사람의 이름·휴대폰 번호(필수)와 이메일(선택, 결제 영수증)을 받고, 필수 동의를 받는다.
 * 결제 수단은 카드와 간편 결제만 (계좌이체·휴대폰 결제는 받지 않는다). 한 번 넣은 정보는 다음 결제 때 저절로 채운다.
 * 가게 상품이면 가게에 이름·휴대폰 번호를 알려 주는 데도 동의를 받는다 — 가게가 무슨 일이 있을 때 전화한다.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from './i18n';
import { C } from './theme';
import { Card } from './ui';

export type Buyer = { name: string; phone: string; email: string };
export type Agree = { order: boolean; privacy: boolean; store: boolean };
export const EMPTY_AGREE: Agree = { order: false, privacy: false, store: false };

/** 숫자만 받아 010-1234-5678 모양으로 */
export function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

/** 휴대폰 번호인지 (010·011·016~019) */
export const validPhone = (v: string) => /^01[016789]-\d{3,4}-\d{4}$/.test(v);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 지난 결제 때 넣은 정보로 채운다 */
export function buyerFrom(me: { buyer?: { name: string | null; phone: string | null; email: string | null } | null } | null): Buyer {
  return {
    name: me?.buyer?.name ?? '',
    phone: me?.buyer?.phone ? formatPhone(me.buyer.phone) : '',
    email: me?.buyer?.email ?? '',
  };
}

/** 결제 버튼을 누를 때 — 빠진 것이 있으면 그 이유(번역 키), 없으면 null */
export function buyerProblem(b: Buyer, a: Agree, withStore: boolean): string | null {
  if (!b.name.trim()) return 'buyerNeedName';
  if (!validPhone(b.phone)) return 'buyerBadPhone';
  if (b.email.trim() && !EMAIL_RE.test(b.email.trim())) return 'buyerBadEmail';
  if (!a.order || !a.privacy || (withStore && !a.store)) return 'buyerNeedAgree';
  return null;
}

/** 서버로 보내는 결제 정보 */
export const buyerBody = (b: Buyer) => ({
  contactName: b.name.trim(), contactPhone: b.phone, buyerEmail: b.email.trim() || undefined, agreed: true,
});

function Check({ on, label, onPress, strong }: { on: boolean; label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable style={st.agreeRow} onPress={onPress} hitSlop={4}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? C.brand : C.ink3} />
      <Text style={[st.agreeText, strong && st.agreeAll]}>{label}</Text>
    </Pressable>
  );
}

export function BuyerCard({
  buyer, onBuyer, agree, onAgree, storeName,
}: {
  buyer: Buyer; onBuyer: (b: Buyer) => void; agree: Agree; onAgree: (a: Agree) => void;
  /** 가게 상품이면 가게 이름 — 가게에 연락처를 알려 주는 동의가 더 붙는다 */
  storeName?: string;
}) {
  const { t } = useI18n();
  const withStore = !!storeName;
  const all = agree.order && agree.privacy && (!withStore || agree.store);
  const badPhone = buyer.phone.length >= 12 && !validPhone(buyer.phone);
  const badEmail = !!buyer.email.trim() && buyer.email.includes('@') && buyer.email.includes('.') && !EMAIL_RE.test(buyer.email.trim());
  return (
    <>
      <Text style={st.section}>{t('buyerTitle')}</Text>
      <Card>
        <Text style={st.label}>{t('buyerName')}</Text>
        <TextInput
          value={buyer.name}
          onChangeText={(v) => onBuyer({ ...buyer, name: v.slice(0, 20) })}
          placeholder={t('buyerNamePh')}
          placeholderTextColor={C.ink3}
          style={st.input}
        />
        <Text style={st.label}>{t('buyerPhone')}</Text>
        <TextInput
          value={buyer.phone}
          onChangeText={(v) => onBuyer({ ...buyer, phone: formatPhone(v) })}
          placeholder="010-1234-5678"
          placeholderTextColor={C.ink3}
          keyboardType="phone-pad"
          maxLength={13}
          style={[st.input, badPhone && { borderColor: C.bad }]}
        />
        {badPhone && <Text style={st.bad}>{t('buyerBadPhone')}</Text>}
        {withStore && !badPhone && <Text style={st.guide}>{t('buyerStoreGuide', { store: storeName! })}</Text>}
        <Text style={st.label}>{t('buyerEmail')}</Text>
        <TextInput
          value={buyer.email}
          onChangeText={(v) => onBuyer({ ...buyer, email: v.trim() })}
          placeholder={t('buyerEmailPh')}
          placeholderTextColor={C.ink3}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[st.input, badEmail && { borderColor: C.bad }]}
        />
        <View style={st.payLine}>
          <Ionicons name="card-outline" size={16} color={C.brand} />
          <Text style={st.payText}>{t('payMethodLine')}</Text>
        </View>
        <View style={st.divider} />
        <Check
          on={all}
          strong
          label={t('agreeAll')}
          onPress={() => onAgree(all ? EMPTY_AGREE : { order: true, privacy: true, store: withStore })}
        />
        <Check on={agree.order} label={t('agreeOrder')} onPress={() => onAgree({ ...agree, order: !agree.order })} />
        <Check on={agree.privacy} label={t('agreePrivacy')} onPress={() => onAgree({ ...agree, privacy: !agree.privacy })} />
        {withStore && (
          <Check on={agree.store} label={t('agreeStore', { store: storeName! })} onPress={() => onAgree({ ...agree, store: !agree.store })} />
        )}
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  // 상품 화면의 다른 칸 제목과 같은 모양
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 12, marginBottom: 8 },
  label: { fontSize: 12.5, fontWeight: '700', color: C.ink2, marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: C.ink, backgroundColor: C.white,
  },
  guide: { fontSize: 12, color: C.ink3, marginTop: 6, lineHeight: 17 },
  bad: { fontSize: 12, color: C.bad, marginTop: 6 },
  payLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  payText: { flex: 1, fontSize: 12.5, color: C.ink2, lineHeight: 18 },
  divider: { height: 1, backgroundColor: C.line, marginTop: 12, marginBottom: 2 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  agreeText: { flex: 1, fontSize: 12.5, color: C.ink2, lineHeight: 18 },
  agreeAll: { fontSize: 14, fontWeight: '800', color: C.ink },
});
