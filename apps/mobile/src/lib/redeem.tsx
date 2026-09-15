/**
 * 매장에서 사용 처리 — 할인 쿠폰 · 받은 딜 · 이용권 공통 흐름.
 *
 * 2026-09-08 확정, 2026-09-15 재확인: 사진(QR) 찍기는 없다.
 * 손님이 [사용하기]를 누르고 화면을 보여주면 **사장님이 처리**한다.
 *   - 할인 쿠폰 · 받은 딜 : 사장님이 [사장님 확인]을 누른다
 *   - 결제 상품(이용권)  : 사장님이 매장 코드를 입력한다 (코드는 점주가 정함)
 * 처리되면 실시간 시계와 카운트다운이 흐르는 완료 화면으로 간다 — 캡처와 구분된다(대표 요구).
 *
 * 쓰는 곳: 사용 탭, 할인 쿠폰, 지갑. 화면마다 따로 만들면 문구와 동작이 어긋나서 한 곳에 둔다.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';
import { useI18n } from './i18n';
import { C } from './theme';
import { Btn } from './ui';

export type RedeemTarget = {
  kind: 'BENEFIT' | 'DROP' | 'VOUCHER';
  merchantId: string;
  merchantName: string;
  /** BENEFIT=UserBenefit id, DROP=DropClaim id, VOUCHER=Voucher id */
  itemId: string;
  title: string;
};

export function useRedeem(onDone?: () => void) {
  const { t } = useI18n();
  const [target, setTarget] = useState<RedeemTarget | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function open(next: RedeemTarget) {
    setPin('');
    setError('');
    setTarget(next);
  }
  function close() {
    if (!busy) setTarget(null);
  }

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<any>('/redeem', {
        method: 'POST',
        body: {
          merchantId: target.merchantId,
          itemType: target.kind,
          itemId: target.itemId,
          ...(target.kind === 'VOUCHER' ? { pin: pin.trim() } : {}),
        },
      });
      setTarget(null);
      onDone?.();
      router.push({
        pathname: '/done',
        params: {
          merchantName: r.merchantName,
          itemTitle: r.itemTitle,
          savedAmount: String(r.savedAmount ?? 0),
          verifyToken: r.verifyToken,
          staff: r.staffCheckRequired ? '1' : '0',
          opened: String(r.openedCoupons ?? 0),
        },
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const isVoucher = target?.kind === 'VOUCHER';

  const modal = (
    <Modal visible={target != null} transparent animationType="fade" onRequestClose={close}>
      <View style={st.back}>
        <View style={st.card}>
          <View style={st.badge}>
            <Text style={st.badgeText}>{t('ownerBadge')}</Text>
          </View>
          <Text style={st.merchant}>{target?.merchantName}</Text>
          <Text style={st.title}>{target?.title}</Text>
          <Text style={st.guide}>{isVoucher ? t('ownerCodeGuide') : t('ownerShowGuide')}</Text>

          {isVoucher && (
            <TextInput
              value={pin}
              onChangeText={setPin}
              placeholder={t('storeCodePh')}
              placeholderTextColor={C.ink3}
              maxLength={10}
              autoFocus
              secureTextEntry
              style={st.pin}
            />
          )}

          {!!error && <Text style={st.error}>{error}</Text>}

          <Btn
            title={busy ? '…' : t('ownerConfirmBtn')}
            onPress={submit}
            disabled={busy || (isVoucher && pin.trim().length < 2)}
          />
          <Pressable onPress={close} style={{ marginTop: 12 }}>
            <Text style={st.cancel}>{t('close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  return { open, modal };
}

const st = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(10,20,30,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { backgroundColor: C.white, borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 },
  badge: {
    alignSelf: 'center', backgroundColor: C.brandSoft, borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 4, marginBottom: 10,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: C.brand },
  merchant: { fontSize: 13, fontWeight: '700', color: C.ink3, textAlign: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: C.ink, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  guide: { fontSize: 14, color: C.ink2, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  pin: {
    borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12,
    fontSize: 22, letterSpacing: 6, textAlign: 'center', color: C.ink, marginBottom: 12, backgroundColor: C.white,
  },
  error: { fontSize: 13, color: C.bad, textAlign: 'center', marginBottom: 10 },
  cancel: { fontSize: 13, color: C.ink3, textAlign: 'center', fontWeight: '600' },
});
