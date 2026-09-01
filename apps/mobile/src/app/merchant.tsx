/**
 * 가맹점 모드 — 점주 전용. 오늘 현황, 사용내역, 내 매장 QR, 직원 확인코드 조회.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { C, won } from '../lib/theme';
import { Btn, Card, EmptyText, Loading, Screen, Tag } from '../lib/ui';

/** 승인 상태 → 라벨·색. 상품/혜택 공용 */
function approvalTag(item: { approval: string; isActive: boolean }, activeLabel = '판매 중') {
  if (item.approval === 'PENDING') return { text: '승인 대기', tone: 'warn' as const };
  if (item.approval === 'REJECTED') return { text: '반려됨', tone: 'bad' as const };
  return item.isActive ? { text: activeLabel, tone: 'ok' as const } : { text: '중지됨', tone: 'bad' as const };
}

export default function MerchantMode() {
  const [my, setMy] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [reds, setReds] = useState<any[] | null>(null);
  const [products, setProducts] = useState<any[] | null>(null);
  const [benefits, setBenefits] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [verifyResult, setVerifyResult] = useState<any | null>(null);

  useFocusEffect(
    useCallback(() => {
      setError('');
      api<any>('/merchant/my').then(setMy).catch((e) => setError(e.message));
      api<any>('/merchant/my/summary').then(setSummary).catch(() => {});
      api<any[]>('/merchant/my/redemptions?days=7').then(setReds).catch(() => {});
      api<any[]>('/merchant/my/products').then(setProducts).catch(() => {});
      api<any[]>('/merchant/my/benefits').then(setBenefits).catch(() => {});
    }, []),
  );

  async function verify() {
    setVerifyResult(null);
    try {
      const r = await api<any>('/merchant/verify', { method: 'POST', body: { token } });
      setVerifyResult(r);
    } catch (e: any) {
      setVerifyResult({ valid: false, error: e.message });
    }
  }

  if (error) return <Screen><EmptyText text={error} /></Screen>;
  if (!my) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ backgroundColor: C.brandSoft, borderColor: C.brandSoft }}>
          <Text style={st.name}>{my.name}</Text>
          <Text style={st.sub}>{my.region} · {my.category} · 수수료 {Number(my.commissionRate)}%</Text>
        </Card>

        {summary && (
          <View style={st.statRow}>
            <Card style={st.statCard}>
              <Text style={st.statLabel}>오늘 사용</Text>
              <Text style={st.statValue}>{summary.todayRedemptions}건</Text>
            </Card>
            <Card style={st.statCard}>
              <Text style={st.statLabel}>이번 달</Text>
              <Text style={st.statValue}>{summary.monthRedemptions}건</Text>
            </Card>
          </View>
        )}

        {/* 현장 운영(사용 확인)이 등록보다 먼저 — 손님이 "사용 처리했어요" 하면 바로 봐야 한다 */}
        <Text style={st.section}>최근 사용내역 (7일)</Text>
        {!reds ? <Loading /> : reds.length === 0 ? (
          <EmptyText text="아직 사용내역이 없습니다" />
        ) : (
          reds.map((r) => (
            <Card key={r.id}>
              <View style={st.rowBetween}>
                <Text style={st.redTitle}>
                  {r.userBenefit?.benefit.title ?? r.dropClaim?.drop.title ?? r.voucher?.product.name}
                </Text>
                <Tag text={r.status === 'DONE' ? '정상' : '취소'} tone={r.status === 'DONE' ? 'ok' : 'bad'} />
              </View>
              <Text style={st.redSub}>
                {new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{r.user.nickname} · {r.headcount}명
                {r.savedAmount > 0 ? ` · 할인 ${won(r.savedAmount)}` : ''}
              </Text>
            </Card>
          ))
        )}

        <Text style={st.section}>직원 확인 코드 조회</Text>
        <Card>
          <Text style={st.hint}>고가 상품은 손님 완료화면의 6자리 코드를 여기에 입력해 확인하세요. (90초 유효)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={token}
              onChangeText={(t) => setToken(t.toUpperCase())}
              placeholder="예: PJ5VMM"
              placeholderTextColor={C.ink3}
              autoCapitalize="characters"
              maxLength={6}
              style={st.input}
            />
            <Btn title="확인" small onPress={verify} disabled={token.length < 4} />
          </View>
          {verifyResult && (
            <View style={[st.verifyBox, { backgroundColor: verifyResult.valid ? C.okSoft : C.badSoft }]}>
              {verifyResult.valid ? (
                <>
                  <Text style={[st.verifyTitle, { color: C.ok }]}>✓ 정상 사용 건입니다</Text>
                  <Text style={st.verifyDetail}>
                    {verifyResult.item} · {verifyResult.customer} · {verifyResult.headcount}명
                  </Text>
                </>
              ) : (
                <Text style={[st.verifyTitle, { color: C.bad }]}>
                  ✕ {verifyResult.expired ? '만료된 코드입니다' : verifyResult.error ?? '확인할 수 없는 코드입니다'}
                </Text>
              )}
            </View>
          )}
        </Card>

        <Text style={st.section}>내 DROP</Text>
        <Card>
          <Btn title="＋ 한정 딜 등록하기" onPress={() => router.push('/merchant-drop')} />
          <Text style={st.hint}>등록하면 본사 승인 후 고객에게 오픈됩니다.</Text>
        </Card>
        {summary?.drops?.map((d: any) => (
          <Card key={d.id}>
            <View style={st.rowBetween}>
              <Text style={st.redTitle} numberOfLines={1}>{d.title}</Text>
              <Tag
                text={{ PENDING: '승인 대기', SCHEDULED: '오픈 예약', OPEN: '판매 중', SOLD_OUT: '완판' }[d.status as string] ?? d.status}
                tone={({ PENDING: 'warn', SCHEDULED: 'brand', OPEN: 'ok', SOLD_OUT: 'gold' } as const)[d.status as string] ?? 'bad'}
              />
            </View>
            <Text style={st.redSub}>
              남은 수량 {d.remainingQty}/{d.totalQty} · 마감 {new Date(d.closeAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Card>
        ))}

        <Text style={st.section}>내 상품 (티켓·예약)</Text>
        <Card>
          <Btn title="＋ 상품 등록하기" onPress={() => router.push('/merchant-product')} />
          <Text style={st.hint}>입장권·체험권·예약 클래스 등 정식 상품. 본사 승인 후 판매됩니다.</Text>
        </Card>
        {products?.map((p) => {
          const t = approvalTag(p);
          return (
            <Card key={p.id}>
              <View style={st.rowBetween}>
                <Text style={st.redTitle} numberOfLines={1}>{p.name}</Text>
                <Tag text={t.text} tone={t.tone} />
              </View>
              <Text style={st.redSub}>
                {{ TICKET: '티켓', RESERVATION: '예약형', PASS: 'PASS' }[p.type as string] ?? p.type}
                {' · '}정상가 {won(p.basePrice)}
                {p.memberPrice != null ? ` · 멤버십가 ${won(p.memberPrice)}` : ''}
              </Text>
              {p.approval === 'REJECTED' && p.rejectReason && (
                <Text style={st.rejectReason}>반려 사유: {p.rejectReason}</Text>
              )}
            </Card>
          );
        })}

        <Text style={st.section}>내 혜택 (멤버십 할인쿠폰)</Text>
        <Card>
          <Btn title="＋ 혜택 등록하기" onPress={() => router.push('/merchant-benefit')} />
          <Text style={st.hint}>멤버십 회원에게 상시로 열리는 할인·증정. 본사 승인 후 적용됩니다.</Text>
        </Card>
        {benefits?.map((b) => {
          const t = approvalTag(b, '적용 중');
          return (
            <Card key={b.id}>
              <View style={st.rowBetween}>
                <Text style={st.redTitle} numberOfLines={1}>{b.title}</Text>
                <Tag text={t.text} tone={t.tone} />
              </View>
              <Text style={st.redSub}>
                {b.type === 'PERCENT' ? `${b.value}% 할인` : b.type === 'AMOUNT' ? `${won(b.value)} 할인` : `${b.freebieName} 증정`}
                {b.companionLimit ? ` · 동반 ${b.companionLimit}인까지` : ''}
                {b.maxUsePerDay ? ` · 하루 ${b.maxUsePerDay}회` : ''}
              </Text>
              {b.approval === 'REJECTED' && b.rejectReason && (
                <Text style={st.rejectReason}>반려 사유: {b.rejectReason}</Text>
              )}
            </Card>
          );
        })}

        <Text style={st.section}>내 매장 QR</Text>
        <Card>
          {my.qrCodes.length === 0 ? (
            <Text style={st.hint}>본사에서 QR 발급 후 사용할 수 있습니다.</Text>
          ) : (
            my.qrCodes.map((q: any) => (
              <View key={q.id} style={{ marginBottom: 6 }}>
                <Text style={st.qrLabel}>{q.label}</Text>
                <Text selectable style={st.qrCode}>{q.code}</Text>
              </View>
            ))
          )}
          <Text style={st.hint}>손님이 이 QR을 스캔하면 이 매장에서 쓸 수 있는 혜택만 자동으로 보입니다.</Text>
        </Card>

      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 19, fontWeight: '700', color: C.brand },
  sub: { fontSize: 12, color: C.ink2, marginTop: 3 },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: C.ink3, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '700', color: C.ink, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 14, marginBottom: 8 },
  hint: { fontSize: 12, color: C.ink3, lineHeight: 18, marginBottom: 8 },
  input: {
    flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 16, fontWeight: '700',
    letterSpacing: 3, color: C.ink, backgroundColor: C.white,
  },
  verifyBox: { borderRadius: 10, padding: 12, marginTop: 10 },
  verifyTitle: { fontSize: 14, fontWeight: '700' },
  verifyDetail: { fontSize: 13, color: C.ink2, marginTop: 4 },
  qrLabel: { fontSize: 12, color: C.ink3, fontWeight: '700' },
  qrCode: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  redTitle: { fontSize: 14, fontWeight: '700', color: C.ink, flex: 1 },
  redSub: { fontSize: 12, color: C.ink3, marginTop: 4 },
  rejectReason: { fontSize: 12, color: C.bad, marginTop: 4, fontWeight: '600' },
});
