/**
 * 할인 쿠폰 — 이 앱의 정체성 화면. (2026-09-08 "내 혜택/제휴 혜택" 통합)
 * 무료 오픈 이후 모두에게 열려 있으므로 화면은 하나면 된다:
 * 절약 요약 → 지역·카테고리 필터 → 매장 사진 + 큰 할인값 + [사용하기].
 * 홈의 카테고리 타일은 ?cat= 파라미터로 이 화면의 해당 탭을 바로 연다.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, img } from './api';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import { C } from './theme';
import { HScroll } from './hscroll';
import { Btn, Card, EmptyText, Loading, Screen } from './ui';

type BenefitGroup = {
  merchant: { id: string; name: string; address: string | null; thumbnailUrl: string | null; region: { name: string }; category: { name: string; emoji: string } };
  items: { id: string; benefitId: string; title: string; type: string; value: number; freebieName: string | null; validTo: string | null; sourceType: string }[];
};

/** 할인값을 쿠폰답게 크게 — 10% / 3,000원 / 무료 */
export function couponValue(b: { type: string; value: number }) {
  if (b.type === 'PERCENT') return `${b.value}%`;
  if (b.type === 'AMOUNT') return `${b.value.toLocaleString()}원`;
  return null; // FREEBIE는 i18n 라벨로
}

function uniq<T>(rows: T[], key: (r: T) => string) {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true)));
}

export default function CouponsScreen() {
  const { me } = useAuth();
  const { t, won, locale, lang } = useI18n();
  const { cat: catParam } = useLocalSearchParams<{ cat?: string }>();
  const [data, setData] = useState<{ totalCount: number; merchants: BenefitGroup[] } | null>(null);
  const [error, setError] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  // 쿠폰 사용 모달 — QR 스캔 없이 [확인] 버튼만으로 처리한다 (2026-09-08 픽스)
  const [pending, setPending] = useState<{ merchantId: string; merchantName: string; itemId: string; title: string } | null>(null);
  const [useResult, setUseResult] = useState<{ savedAmount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // 담기(찜) — MY의 "담은 목록"에 모인다
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  async function toggleSave(benefitId: string) {
    const key = `BENEFIT:${benefitId}`;
    setSavedIds((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }); // 낙관적 반영
    try {
      await api('/me/saves', { method: 'POST', body: { itemType: 'BENEFIT', refId: benefitId } });
    } catch {
      setSavedIds((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }); // 실패 시 원복
    }
  }

  // 홈 카테고리 타일에서 넘어온 경우 그 카테고리 탭을 바로 연다
  useEffect(() => {
    if (typeof catParam === 'string' && catParam.length > 0) setCat(catParam);
  }, [catParam]);

  const load = useCallback(() => {
    setError('');
    api<{ totalCount: number; merchants: BenefitGroup[] }>('/me/benefits')
      .then(setData)
      .catch((e) => setError(e.message));
    api<string[]>('/me/saves/ids').then((ids) => setSavedIds(new Set(ids))).catch(() => {});
  }, [lang]);
  useFocusEffect(load);

  async function confirmUse() {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await api<{ savedAmount: number }>('/redeem', {
        method: 'POST',
        body: { merchantId: pending.merchantId, itemType: 'BENEFIT', itemId: pending.itemId },
      });
      setUseResult({ savedAmount: r.savedAmount });
      load();
    } catch (e: any) {
      setPending(null);
      setUseResult(null);
      if (Platform.OS === 'web') window.alert(e.message);
      else Alert.alert('', e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <EmptyText text={t('benefitsLoginEmpty')} />
          <Btn title={t('goLogin')} onPress={() => router.push('/(tabs)/my')} />
        </View>
      </Screen>
    );
  }

  // 쿠폰 '사용'은 유료 잼이 시작된 뒤에만 (보기·담기는 누구나)
  const canUse = !!me.membership?.isPaid && me.membership.started;
  function onLockedPress() {
    const go = () => router.push('/(tabs)/my');
    if (Platform.OS === 'web') { if (window.confirm(t('goStartJam'))) go(); }
    else Alert.alert('', t('goStartJam'), [{ text: t('close'), style: 'cancel' }, { text: t('start'), onPress: go }]);
  }

  const regions = data ? uniq(data.merchants.map((g) => g.merchant.region.name), (x) => x) : [];
  const cats = data
    ? uniq(data.merchants.map((g) => g.merchant.category), (x) => x.name)
    : [];
  const shown = (data?.merchants ?? []).filter(
    (g) => (!region || g.merchant.region.name === region) && (!cat || g.merchant.category.name === cat),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* 절약 요약 — 사용자가 계산하지 않게 앱이 계산해서 보여준다 */}
        <Card style={{ backgroundColor: C.brand, borderColor: C.brand }}>
          <Text style={st.savingLabel}>{t('savedLabel')}</Text>
          <Text style={st.savingValue}>{won(me.savings.thisMonth)}</Text>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
            <Text style={st.savingSub}>{t('savedTotal', { amt: won(me.savings.total) })}</Text>
            {me.savings.recoveryRate != null && (
              <Text style={st.savingSub}>{t('savedRecovery', { r: me.savings.recoveryRate })}</Text>
            )}
          </View>
        </Card>

        {!data && !error && <Loading />}
        {error !== '' && <EmptyText text={error} />}

        {data && data.totalCount === 0 && (
          <View>
            <EmptyText text={t('noBenefitsYet')} />
            <Btn title={t('seePlans')} onPress={() => router.push('/(tabs)/my')} />
          </View>
        )}

        {/* 지역 필터 */}
        {regions.length > 1 && (
          <HScroll horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 7 }}>
            <Pressable style={[st.tab, region === null && st.tabOn]} onPress={() => setRegion(null)}>
              <Text style={[st.tabText, region === null && st.tabTextOn]}>{t('allRegions')}</Text>
            </Pressable>
            {regions.map((r) => (
              <Pressable key={r} style={[st.tab, region === r && st.tabOn]} onPress={() => setRegion(r)}>
                <Text style={[st.tabText, region === r && st.tabTextOn]}>{r}</Text>
              </Pressable>
            ))}
          </HScroll>
        )}

        {/* 카테고리 탭 — 홈은 쿠폰 슬라이드만 보여주고, 종류별 탐색은 여기서 한다 (2026-09-08 확정 구조) */}
        {cats.length > 1 && (
          <HScroll horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 7 }}>
            <Pressable style={[st.tab, cat === null && st.tabOn]} onPress={() => setCat(null)}>
              <Text style={[st.tabText, cat === null && st.tabTextOn]}>{t('all')}</Text>
            </Pressable>
            {cats.map((ct) => (
              <Pressable key={ct.name} style={[st.tab, cat === ct.name && st.tabOn]} onPress={() => setCat(ct.name)}>
                <Text style={[st.tabText, cat === ct.name && st.tabTextOn]}>{ct.emoji} {ct.name}</Text>
              </Pressable>
            ))}
          </HScroll>
        )}

        {data && data.totalCount > 0 && shown.length === 0 && <EmptyText text={t('noMerchants')} />}

        {shown.map((g) => (
          <View key={g.merchant.id} style={st.shopCard}>
            {/* 매장 사진 배너 — 사진이 쿠폰을 판다 */}
            <Pressable onPress={() => router.push(`/store/${g.merchant.id}` as never)}>
              {g.merchant.thumbnailUrl ? (
                <Image source={{ uri: img(g.merchant.thumbnailUrl, 720) }} style={st.shopImg} />
              ) : (
                <View style={[st.shopImg, { backgroundColor: C.brandSoft }]} />
              )}
              <LinearGradient colors={['rgba(10,18,26,0)', 'rgba(10,18,26,0.72)']} style={st.shopShade} />
              <View style={st.shopHead}>
                <Text style={st.shopName} numberOfLines={1}>{g.merchant.category.emoji} {g.merchant.name}</Text>
                <Text style={st.shopRegion}>{g.merchant.region.name}</Text>
              </View>
            </Pressable>
            {/* 쿠폰들 — 할인값이 주인공 */}
            {g.items.map((b, i) => {
              const v = couponValue(b);
              return (
                <View key={b.id} style={[st.couponRow, i > 0 && st.couponDivider]}>
                  <View style={st.couponValueBox}>
                    <Text style={st.couponValue}>{v ?? t('freeLabel')}</Text>
                    {v && <Text style={st.couponValueSub}>{t('offLabel')}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.benefitTitle} numberOfLines={2}>{b.title}</Text>
                    {b.validTo && (
                      <Text style={st.validTo}>
                        {t('untilDate', { date: new Date(b.validTo).toLocaleDateString(locale) })}
                      </Text>
                    )}
                  </View>
                  <Pressable hitSlop={8} onPress={() => toggleSave(b.benefitId)}>
                    <Ionicons
                      name={savedIds.has(`BENEFIT:${b.benefitId}`) ? 'heart' : 'heart-outline'}
                      size={22}
                      color={savedIds.has(`BENEFIT:${b.benefitId}`) ? '#E8503A' : C.ink3}
                    />
                  </Pressable>
                  {canUse ? (
                    <Pressable
                      style={st.useBtn}
                      onPress={() => { setUseResult(null); setPending({ merchantId: g.merchant.id, merchantName: g.merchant.name, itemId: b.id, title: b.title }); }}
                    >
                      <Text style={st.useBtnText}>{t('useNow')}</Text>
                    </Pressable>
                  ) : (
                    // 무료 회원 또는 시작 전 잼 — 눌러도 서버에서 막히니, 먼저 상태를 보여주고 MY로 안내한다
                    <Pressable style={[st.useBtn, st.useBtnLocked]} onPress={onLockedPress}>
                      <Text style={[st.useBtnText, { color: C.ink2 }]}>
                        {me.membership?.isPaid && !me.membership.started
                          ? t('useFrom', { date: new Date(me.membership.startAt).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' }) })
                          : t('useLocked')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {data && data.totalCount > 0 && (
          <Text style={st.hint}>{t('benefitsHint')}</Text>
        )}
      </ScrollView>

      {/* 쿠폰 사용 모달 — 직원에게 보여주고 확인 버튼 한 번이면 끝 */}
      <Modal visible={pending != null} transparent animationType="fade" onRequestClose={() => !busy && setPending(null)}>
        <View style={st.modalBack}>
          <View style={st.modalCard}>
            {useResult ? (
              <>
                <Text style={st.modalDone}>✓ {t('usedDoneTitle')}</Text>
                {useResult.savedAmount > 0 && (
                  <Text style={st.modalSaved}>{t('usedSaved', { amt: won(useResult.savedAmount) })}</Text>
                )}
                <Text style={st.modalItem}>{pending?.merchantName} · {pending?.title}</Text>
                <Btn title={t('close')} onPress={() => { setPending(null); setUseResult(null); }} />
              </>
            ) : (
              <>
                <Text style={st.modalMerchant}>{pending?.merchantName}</Text>
                <Text style={st.modalTitle}>{pending?.title}</Text>
                <Text style={st.modalGuide}>{t('showStaffFirst')}</Text>
                <Btn title={busy ? '…' : t('confirmUse')} onPress={confirmUse} disabled={busy} />
                <Pressable onPress={() => !busy && setPending(null)} style={{ marginTop: 10 }}>
                  <Text style={st.modalCancel}>{t('close')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const st = StyleSheet.create({
  savingLabel: { color: '#CFE1F2', fontSize: 12, fontWeight: '700' },
  savingValue: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', marginTop: 3, letterSpacing: -0.5 },
  savingSub: { color: '#BCD6EC', fontSize: 12, fontWeight: '600' },
  benefitTitle: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  validTo: { fontSize: 11, color: C.ink3, marginTop: 1 },
  hint: { textAlign: 'center', color: C.ink3, fontSize: 12, marginTop: 8, marginBottom: 24 },
  useBtn: { backgroundColor: C.brand, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  useBtnLocked: { backgroundColor: C.ground, borderWidth: 1, borderColor: C.line },
  useBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shopCard: {
    backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line,
    overflow: 'hidden', marginBottom: 12,
  },
  shopImg: { width: '100%', height: 108 },
  shopShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 108 },
  shopHead: { position: 'absolute', left: 14, right: 14, bottom: 10, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  shopName: { color: '#fff', fontSize: 17, fontWeight: '700', flexShrink: 1 },
  shopRegion: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  couponDivider: { borderTopWidth: 1, borderTopColor: C.line },
  couponValueBox: {
    minWidth: 62, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF1EC', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 6,
  },
  couponValue: { fontSize: 17, fontWeight: '800', color: '#E8503A', letterSpacing: -0.5 },
  couponValueSub: { fontSize: 10, fontWeight: '700', color: '#E8503A', marginTop: 1 },
  tab: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
  },
  catHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 2 },
  catHeadText: { fontSize: 17, fontWeight: '700', color: C.ink },
  catBack: { fontSize: 22, fontWeight: '700', color: C.ink, paddingRight: 2, marginTop: -2 },
  catClear: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  catClearText: { fontSize: 12.5, fontWeight: '700', color: C.ink2 },
  tabOn: { backgroundColor: C.brand, borderColor: C.brand },
  tabText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  tabTextOn: { color: '#fff' },
  modalBack: { flex: 1, backgroundColor: 'rgba(10,20,30,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  modalCard: { backgroundColor: C.white, borderRadius: 18, padding: 24, width: '100%', maxWidth: 360, alignItems: 'stretch' },
  modalMerchant: { fontSize: 13, fontWeight: '700', color: C.ink3, textAlign: 'center' },
  modalTitle: { fontSize: 19, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  modalGuide: { fontSize: 14, color: C.ink2, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  modalCancel: { fontSize: 13, color: C.ink3, textAlign: 'center', fontWeight: '600' },
  modalDone: { fontSize: 24, fontWeight: '700', color: C.ok, textAlign: 'center' },
  modalSaved: { fontSize: 16, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 6 },
  modalItem: { fontSize: 13, color: C.ink3, textAlign: 'center', marginTop: 4, marginBottom: 16 },
});
