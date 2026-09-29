/**
 * 상품 상세 — 예약형은 날짜·시간·인원 선택 → 결제 → 예약확정까지 앱 안에서 끝낸다.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { track } from '../../lib/analytics';
import { api, img } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ContactCard, validPhone } from '../../lib/contact';
import { useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, LoadError, Loading, Screen, Tag } from '../../lib/ui';
import { couponValue } from '../../lib/coupons';
import { RefundNotice } from '../../lib/refund-notice';
import { VisitDateModal, visitDayText } from '../../lib/visit-date';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const [p, setP] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false); // 담기(찜)
  const [slotId, setSlotId] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState(1);
  // 연락처 — 가게가 무슨 일이 있을 때 전화할 번호 (2026-09-29). 한 번 넣으면 다음에 저절로 채운다
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  useEffect(() => { if (me?.phone && !phone) setPhone(me.phone); }, [me?.phone]);
  const [busy, setBusy] = useState(false);
  /** 가는 날 'YYYY-MM-DD' — 티켓·PASS만, 안 골라도 된다 (2026-09-24 대표 확정 3-2) */
  const [visitDay, setVisitDay] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api<any>(`/products/${id}`).then((r) => {
      setP(r);
      track('product_view', { type: 'product', id: String(id) });
    }).catch(() => setFailed(true));
    if (me) api<string[]>('/me/saves/ids').then((ids) => setSaved(ids.includes(`PRODUCT:${id}`))).catch(() => {});
  }, [id, lang, me]);
  useFocusEffect(load);

  async function toggleSave() {
    if (!me) { router.push('/(tabs)/my'); return; }
    setSaved((s) => !s);
    try {
      await api('/me/saves', { method: 'POST', body: { itemType: 'PRODUCT', refId: id } });
    } catch {
      setSaved((s) => !s);
    }
  }

  async function purchase() {
    if (!me) {
      router.push('/(tabs)/my');
      return;
    }
    if (p.type === 'RESERVATION' && !slotId) {
      notify(t('resvTimeTitle'), t('pickTimeFirst'));
      return;
    }
    if (!validPhone(phone) || !agree) {
      notify(t('contactTitle'), !validPhone(phone) ? t('contactInvalid') : t('contactNeeded'));
      return;
    }
    setBusy(true);
    try {
      const r = await api<any>(`/products/${id}/purchase`, {
        method: 'POST',
        body: {
          slotId: slotId ?? undefined, headcount, contactName: me.nickname, contactPhone: phone,
          visitDate: p.type !== 'RESERVATION' && visitDay ? visitDay : undefined,
        },
      });
      track('product_purchase', { type: 'product', id: String(id) }, { headcount });
      notify(t('doneTitle'), r.message);
      router.push('/wallet');
    } catch (e: any) {
      notify(t('cantBuy'), e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!p) {
    return <Screen>{failed ? <LoadError text={t('loadFailed')} retryLabel={t('retry')} onRetry={load} /> : <Loading />}</Screen>;
  }

  /** 'YYYY-MM-DD' → '10월 3일 (금)' */
  const dayText = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'short' });
  };
  const rangeText = (a: string | null, b: string | null) =>
    a && a === b ? `${dayText(a)} ${t('periodOneDay')}` : `${a ? dayText(a) : ''} ~ ${b ? dayText(b) : ''}`.trim();
  // 판매 기간 밖이면 결제 버튼을 막는다
  const saleBlocked = p.saleState === 'UPCOMING' || p.saleState === 'ENDED';
  const unit = p.memberPriceApplies ? p.memberPrice : p.basePrice;
  const total = p.type === 'RESERVATION' ? unit * headcount : unit;
  // 가는 날은 딸려 받는 쿠폰이 있는 티켓·PASS에서만 묻는다 — 쿠폰 여는 날을 정하는 게 쓰임새다
  const asksVisit = p.type !== 'RESERVATION' && !!p.visitRange && p.bundledCoupons?.length > 0;
  const couponDays = p.bundledCoupons?.length ? Math.min(...p.bundledCoupons.map((c: any) => c.validDays)) : 0;

  return (
    <Screen>
      {/* 하단 고정 결제바에 가리지 않도록 여백을 넉넉히 둔다 */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 210 }}>
        {p.imageUrl && <Image source={{ uri: img(p.imageUrl, 960) }} style={st.hero} />}
        <Card>
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
            <Tag text={p.type === 'RESERVATION' ? t('typeReservation') : p.type === 'PASS' ? 'PASS' : t('typeTicket')} />
            {p.weatherDependent && <Tag text={t('weather')} tone="warn" />}
            {p.verification !== 'QR_ONLY' && <Tag text={t('staffVerify')} tone="warn" />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Text style={[st.title, { flex: 1 }]}>{p.name}</Text>
            <Pressable hitSlop={10} onPress={toggleSave} style={{ marginTop: 3 }}>
              <Ionicons name={saved ? 'heart' : 'heart-outline'} size={26} color={saved ? '#E8503A' : C.ink3} />
            </Pressable>
          </View>
          <Text style={st.merchant}>{p.merchant.name} · {p.merchant.address ?? ''}</Text>
          {p.description && <Text style={st.desc}>{p.description}</Text>}

          <View style={st.priceRow}>
            {p.memberPriceApplies ? (
              <>
                <Tag text={t('memberPrice')} tone="gold" />
                <Text style={st.price}>{won(p.memberPrice)}</Text>
                <Text style={st.normal}>{won(p.basePrice)}</Text>
              </>
            ) : (
              <>
                <Text style={st.price}>{won(p.basePrice)}</Text>
                {p.memberPrice != null && (
                  <Text style={st.memberHint}>
                    {/* 회원가는 잼 범위를 따르므로 어느 잼인지 이름으로 알려준다 (2026-09-24 대표 확정 3-5 A) */}
                    {p.memberPricePlans?.length
                      ? t('memberPriceHintPlans', {
                          plans: p.memberPricePlans.slice(0, 3).map((x: any) => x.name).join('·') +
                            (p.memberPricePlans.length > 3 ? ` +${p.memberPricePlans.length - 3}` : ''),
                          price: won(p.memberPrice),
                        })
                      : t('memberPriceHint', { price: won(p.memberPrice) })}
                  </Text>
                )}
              </>
            )}
          </View>
          {(p.remainingQty != null || p.maxPerUser != null) && (
            <Text style={st.qtyLine}>
              {[
                p.remainingQty != null ? t('qtyLeft', { n: p.remainingQty }) : null,
                p.maxPerUser != null ? t('perUserLimit', { n: p.maxPerUser }) : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          )}
          {/* 판매 기간·이용 기간 (2026-09-19 문서 4-6) */}
          {p.period && (p.period.saleFrom || p.period.saleTo) && (
            <Text style={st.periodLine}>{t('periodSale', { range: rangeText(p.period.saleFrom, p.period.saleTo) })}</Text>
          )}
          {p.type !== 'RESERVATION' && p.period && (p.period.useFrom || p.period.useTo) && (
            <Text style={st.periodLine}>{t('periodUse', { range: rangeText(p.period.useFrom, p.period.useTo) })}</Text>
          )}
        </Card>

        {p.type === 'RESERVATION' && (
          <>
            <Text style={st.section}>{t('pickTime')}</Text>
            {p.slots.length === 0 && <Card><Text style={st.noSlot}>{t('noSlots')}</Text></Card>}
            {p.slots.map((s: any) => {
              const label = new Date(s.startAt).toLocaleString(locale, {
                month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
              });
              const disabled = s.remaining < headcount;
              return (
                <Pressable key={s.id} onPress={() => !disabled && setSlotId(s.id)}>
                  <Card style={slotId === s.id ? { borderColor: C.brand, borderWidth: 2 } : undefined}>
                    <View style={st.rowBetween}>
                      <Text style={[st.slotLabel, disabled && { color: C.ink3 }]}>{label}</Text>
                      <Text style={[st.slotRemain, disabled && { color: C.bad }]}>
                        {disabled ? t('closedNow') : t('seatsLeft', { n: s.remaining })}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })}

          </>
        )}

        {/* 결제하면 함께 받는 '근처 할인 쿠폰' — 무료 회원도 이건 그대로 쓴다 (2026-09-12 대표 확정) */}
        {p.bundledCoupons?.length > 0 && (
          <>
            <Text style={st.section}>{t('bundledTitle')}</Text>
            <Card>
              <Text style={st.bundledSub}>{t('bundledSub')}</Text>
              {p.bundledCoupons.map((c: any, i: number) => (
                <View key={c.benefitId} style={[st.bundledRow, i > 0 && st.bundledDivider]}>
                  <View style={st.bundledValueBox}>
                    <Text style={st.bundledValue}>{couponValue(c) ?? t('freeLabel')}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.bundledName} numberOfLines={1}>{c.title}</Text>
                    <Text style={st.bundledMerchant} numberOfLines={1}>
                      {c.merchant.category.emoji} {c.merchant.name} · {c.merchant.region.name}
                    </Text>
                  </View>
                </View>
              ))}
              <Text style={st.bundledDays}>
                {p.type === 'RESERVATION'
                  ? t('bundledFromResv', { n: couponDays })
                  : p.period?.useFrom && p.period.useFrom === p.period.useTo
                  ? t('bundledFromVisit', { date: visitDayText(p.period.useFrom, locale), n: couponDays })
                  : visitDay
                  ? t('bundledFromVisit', { date: visitDayText(visitDay, locale), n: couponDays })
                  : t('pendingGuide')}
              </Text>
            </Card>
          </>
        )}

        {/* 가는 날 — 고르면 그날 0시에 쿠폰이 열린다. 안 고르면 가게에서 이용권을 쓸 때 (3-2) */}
        {asksVisit && (
          <>
            <Text style={st.section}>
              {t('visitTitle')} <Text style={st.sectionHint}>· {t('visitOptional')}</Text>
            </Text>
            <Card>
              <Pressable style={st.visitRow} onPress={() => setPicking(true)}>
                <View style={[st.visitIcon, !!visitDay && st.visitIconOn]}>
                  <Ionicons name="calendar-outline" size={18} color={visitDay ? '#fff' : C.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[st.visitValue, !visitDay && { color: C.ink3 }]}>
                    {visitDay ? t('visitChosen', { date: visitDayText(visitDay, locale) }) : t('visitNone')}
                  </Text>
                  <Text style={st.visitGuide}>{visitDay ? t('visitGuideSet') : t('visitGuideUnset')}</Text>
                </View>
                <Text style={st.visitBtn}>{visitDay ? t('visitChange') : t('visitPick')}</Text>
              </Pressable>
            </Card>
          </>
        )}

        {/* 연락처 — 로그인한 손님에게만. 판매 중일 때만 묻는다 */}
        {me && !saleBlocked && (
          <ContactCard phone={phone} onPhone={setPhone} agree={agree} onAgree={setAgree} storeName={p.merchant.name} />
        )}

        {/* 취소·환불 안내 — 결제 전에 보여준다. 숫자는 본사 설정에서 (2026-09-28) */}
        {/* 날짜 있는 티켓(이용 시작일이 있는 티켓 — 불꽃축제 등)은 예약 상품처럼 이용일 기준 규정 */}
        <RefundNotice kind={p.type === 'RESERVATION' || p.period?.useFrom ? 'RESERVATION' : p.type} hasBundled={p.bundledCoupons?.length > 0} />
      </ScrollView>

      {/* 하단 고정 결제바 — 스크롤과 무관하게 항상 보인다 */}
      <View style={st.payBar}>
        {p.type === 'RESERVATION' && (
          <View style={st.stepper}>
            <Pressable hitSlop={8} onPress={() => setHeadcount((h) => Math.max(1, h - 1))}>
              <Text style={st.stepBtn}>−</Text>
            </Pressable>
            <Text style={st.headcount}>{t('people', { n: headcount })}</Text>
            <Pressable hitSlop={8} onPress={() => setHeadcount((h) => Math.min(10, h + 1))}>
              <Text style={st.stepBtn}>＋</Text>
            </Pressable>
          </View>
        )}
        <Btn
          title={
            p.saleState === 'UPCOMING' ? t('saleUpcoming', { date: dayText(p.period.saleFrom) })
            : p.saleState === 'ENDED' ? t('saleEnded')
            : p.type === 'RESERVATION' ? t('payTotalReserve', { price: won(total) }) : t('payTotal', { price: won(total) })
          }
          onPress={purchase}
          disabled={busy || saleBlocked}
        />
        <Text style={st.note}>
          {p.type === 'RESERVATION' ? t('resvNote') : p.type === 'PASS' ? t('passNote') : t('ticketNote')}
        </Text>
      </View>

      {asksVisit && (
        <VisitDateModal
          visible={picking}
          value={visitDay}
          range={p.visitRange}
          onClose={() => setPicking(false)}
          onSave={(day) => { setVisitDay(day); setPicking(false); }}
        />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { width: '100%', height: 190, borderRadius: 16, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: C.ink, lineHeight: 27 },
  merchant: { fontSize: 13, color: C.ink3, marginTop: 4 },
  desc: { fontSize: 14, color: C.ink2, marginTop: 10, lineHeight: 21 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  price: { fontSize: 24, fontWeight: '700', color: C.ink },
  normal: { fontSize: 14, color: C.ink3, textDecorationLine: 'line-through' },
  memberHint: { fontSize: 12, color: C.gold, fontWeight: '700' },
  qtyLine: { fontSize: 12.5, fontWeight: '700', color: C.brand, marginTop: 8 },
  periodLine: { fontSize: 12.5, fontWeight: '600', color: C.ink2, marginTop: 6 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 12, marginBottom: 8 },
  noSlot: { fontSize: 13, color: C.ink3, textAlign: 'center' },
  slotLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  slotRemain: { fontSize: 13, fontWeight: '700', color: C.brand },
  stepBtn: { fontSize: 24, fontWeight: '700', color: C.brand, paddingHorizontal: 14 },
  headcount: { fontSize: 17, fontWeight: '700', color: C.ink, minWidth: 52, textAlign: 'center' },
  note: { fontSize: 11.5, color: C.ink3, textAlign: 'center', marginTop: 8, lineHeight: 16 },
  bundledSub: { fontSize: 12.5, color: C.ink2, marginBottom: 10, lineHeight: 18 },
  bundledRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  bundledDivider: { borderTopWidth: 1, borderTopColor: C.line },
  bundledValueBox: {
    minWidth: 56, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF1EC', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 6,
  },
  bundledValue: { fontSize: 15, fontWeight: '800', color: '#E8503A', letterSpacing: -0.4 },
  bundledName: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  bundledMerchant: { fontSize: 11.5, color: C.ink3, marginTop: 1 },
  bundledDays: { fontSize: 11, color: C.ink3, marginTop: 8, textAlign: 'right' },
  sectionHint: { fontSize: 12, fontWeight: '600', color: C.ink3 },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  visitIcon: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.brandSoft,
  },
  visitIconOn: { backgroundColor: C.brand },
  visitValue: { fontSize: 15, fontWeight: '800', color: C.ink },
  visitGuide: { fontSize: 11.5, color: C.ink2, marginTop: 3, lineHeight: 16 },
  visitBtn: {
    fontSize: 12.5, fontWeight: '800', color: C.brand,
    borderWidth: 1, borderColor: C.brand, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden',
  },
  payBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 8,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
