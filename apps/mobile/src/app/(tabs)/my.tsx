/**
 * MY — 로그인(간편가입), 멤버십 상태/구매, 가맹점 모드 진입.
 * 멤버십 카드에는 가격이 아니라 "얼마 아꼈고 회수율이 몇 %인지"를 먼저 보여준다.
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LangChips, useI18n } from '../../lib/i18n';
import { C } from '../../lib/theme';
import { Btn, Card, Loading, Screen, Tag } from '../../lib/ui';

type Plan = { code: string; name: string; description: string; price: number; durationDays: number };

/** 당분간 프로덕션에서도 임시(시연) 계정 로그인을 연다. 실서비스 전환 시 false로. */
const DEMO_MODE = true;

const SOCIALS = [
  { provider: 'KAKAO', labelKey: 'socialKakao', bg: '#FEE500', fg: '#191600' },
  { provider: 'NAVER', labelKey: 'socialNaver', bg: '#03C75A', fg: '#fff' },
  { provider: 'GOOGLE', labelKey: 'socialGoogle', bg: '#fff', fg: '#1F1F1F' },
  { provider: 'APPLE', labelKey: 'socialApple', bg: '#000', fg: '#fff' },
];

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
  else Alert.alert(title, msg);
}

export default function MyScreen() {
  const { ready, me, login, logout, refresh } = useAuth();
  const { t, won, locale } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Plan[]>('/membership/plans').then(setPlans).catch(() => {});
  }, []);

  async function doLogin(provider: string) {
    setBusy(true);
    try {
      // 개발 모드: 데모 계정으로 로그인. 실서비스에서는 각 소셜 SDK 토큰으로 대체.
      const providerId = provider === 'KAKAO' ? 'demo-user-1' : `demo-${provider.toLowerCase()}-1`;
      await login(provider, providerId);
    } catch (e: any) {
      notify(t('loginFail'), e.message);
    } finally {
      setBusy(false);
    }
  }

  /** 개발/시연 전용 — 시드된 점주 계정으로 바로 로그인해 가맹점 모드를 보여준다. */
  async function doOwnerLogin(providerId: string) {
    setBusy(true);
    try {
      await login('KAKAO', providerId);
    } catch (e: any) {
      notify(t('loginFail'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function buy(plan: Plan) {
    const run = async () => {
      setBusy(true);
      try {
        const r = await api<any>('/membership/purchase', { method: 'POST', body: { planCode: plan.code } });
        await refresh();
        notify(t('memberStarted'), r.message);
      } catch (e: any) {
        notify(t('cantBuy'), e.message);
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('buyConfirmWeb', { plan: plan.name, price: won(plan.price) }))) await run();
    } else {
      Alert.alert(plan.name, t('buyConfirmNative', { price: won(plan.price), days: plan.durationDays }), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('start'), onPress: run },
      ]);
    }
  }

  if (!ready) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {!me ? (
          <>
            <Card>
              <Text style={st.hero}>{t('myHero')}</Text>
              <Text style={st.heroSub}>{t('myHeroSub')}</Text>
              {SOCIALS.map((s) => (
                <View key={s.provider} style={{ marginTop: 8 }}>
                  <Text
                    onPress={() => !busy && doLogin(s.provider)}
                    style={[st.socialBtn, { backgroundColor: s.bg, color: s.fg }]}
                  >
                    {t(s.labelKey)}
                  </Text>
                </View>
              ))}
              <Text style={st.devNote}>{t('demoNote')}</Text>
              {DEMO_MODE && (
                <View style={st.devOwnerRow}>
                  <Text style={st.devOwner} onPress={() => !busy && doOwnerLogin('demo-owner-2')}>
                    [시연용] 승인된 점주 화면 체험 (서프홀릭)
                  </Text>
                </View>
              )}
            </Card>
          </>
        ) : (
          <>
            {/* 멤버십 카드 */}
            <Card style={{ backgroundColor: C.ink, borderColor: C.ink }}>
              <View style={st.rowBetween}>
                <Text style={st.cardBrand}>HOLIC GEM</Text>
                {me.membership ? (
                  <Tag text={me.membership.planName} tone="gold" />
                ) : (
                  <Tag text={t('freeTier')} tone="warn" />
                )}
              </View>
              <Text style={st.cardName}>{me.nickname}</Text>
              {me.membership ? (
                <>
                  <Text style={st.cardSaving}>
                    {t('cardSaved', { amt: won(me.savings.thisMonth) })}
                    {me.savings.recoveryRate != null && t('recoveryRate', { r: me.savings.recoveryRate })}
                  </Text>
                  <Text style={st.cardUntil}>
                    {t('untilDate', { date: new Date(me.membership.endAt).toLocaleDateString(locale) })}
                  </Text>
                </>
              ) : (
                <Text style={st.cardSaving}>{t('cardNoPlan')}</Text>
              )}
            </Card>

            {/* 멤버십 구매 */}
            {!me.membership && (
              <>
                <Text style={st.section}>{t('startPlanSection')}</Text>
                {plans.map((p) => (
                  <Card key={p.code}>
                    <View style={st.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.planName}>{p.name}</Text>
                        <Text style={st.planDesc}>{p.description}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <Text style={st.planPrice}>{won(p.price)}</Text>
                        <Btn title={t('startShort')} small onPress={() => buy(p)} disabled={busy} />
                      </View>
                    </View>
                  </Card>
                ))}
              </>
            )}

            {/* 바로가기 */}
            <Text style={st.section}>{t('shortcuts')}</Text>
            <Card>
              <View style={st.rowBetween}>
                <View>
                  <Text style={st.planName}>{t('myBenefitsAll')}</Text>
                  <Text style={st.planDesc}>{t('myBenefitsAllSub')}</Text>
                </View>
                <Btn title={t('view')} small onPress={() => router.push('/benefits')} />
              </View>
            </Card>
            <Card>
              <View style={st.rowBetween}>
                <View>
                  <Text style={st.planName}>{t('titleWallet')}</Text>
                  <Text style={st.planDesc}>{t('walletSub')}</Text>
                </View>
                <Btn title={t('view')} small onPress={() => router.push('/wallet')} />
              </View>
            </Card>

            {/* 내 가게 — 사장님도 같은 카카오 로그인. 계정에 가게가 연결되면 여기가 자동으로 열린다 */}
            <Text style={st.section}>{t('myStore')}</Text>
            {me.ownedMerchant ? (
              me.ownedMerchant.status === 'ACTIVE' ? (
                <Card>
                  <View style={st.rowBetween}>
                    <View>
                      <Text style={st.planName}>{me.ownedMerchant.name}</Text>
                      <Text style={st.planDesc}>사용내역 · DROP 등록 · 정산</Text>
                    </View>
                    <Btn title="가맹점 모드" small onPress={() => router.push('/merchant')} />
                  </View>
                </Card>
              ) : (
                <Card>
                  <Text style={st.planName}>{me.ownedMerchant.name}</Text>
                  <Text style={st.planDesc}>입점 신청 접수됨 — 본사 승인을 기다리고 있어요 ⏳</Text>
                </Card>
              )
            ) : (
              <Card>
                <View style={st.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.planName}>사장님이신가요?</Text>
                    <Text style={st.planDesc}>가게를 등록하면 한정 딜을 직접 올릴 수 있어요</Text>
                  </View>
                  <Btn title="입점 신청" small onPress={() => router.push('/apply')} />
                </View>
              </Card>
            )}

            <View style={{ marginTop: 18 }}>
              <Btn title={t('logout')} tone="ghost" onPress={logout} />
            </View>
          </>
        )}

        {/* 언어 설정 — 로그인 여부와 무관하게 항상 노출 */}
        <Text style={st.section}>🌐 {t('language')}</Text>
        <Card>
          <LangChips />
        </Card>

        <Text style={st.foot}>
          {t('footNote')}{'\n'}
          {t('build')} {process.env.EXPO_PUBLIC_BUILD ?? '개발 모드'}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  hero: { fontSize: 19, fontWeight: '700', color: C.ink, textAlign: 'center' },
  heroSub: { fontSize: 13, color: C.ink3, textAlign: 'center', marginTop: 6, marginBottom: 10, lineHeight: 19 },
  socialBtn: {
    textAlign: 'center', paddingVertical: 13, borderRadius: 10, overflow: 'hidden',
    fontSize: 15, fontWeight: '700', borderWidth: 1, borderColor: C.line,
  },
  devNote: { fontSize: 11, color: C.ink3, textAlign: 'center', marginTop: 10 },
  devOwnerRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  devOwner: { fontSize: 12, color: C.brand, fontWeight: '700', textDecorationLine: 'underline' },
  cardBrand: { color: '#9DB8D2', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  cardName: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 10 },
  cardSaving: { color: '#C8D9EA', fontSize: 13, fontWeight: '700', marginTop: 6 },
  cardUntil: { color: '#7E97AE', fontSize: 11, marginTop: 3 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, marginTop: 16, marginBottom: 8 },
  planName: { fontSize: 16, fontWeight: '700', color: C.ink },
  planDesc: { fontSize: 12, color: C.ink3, marginTop: 2 },
  planPrice: { fontSize: 16, fontWeight: '700', color: C.brand },
  foot: { fontSize: 11, color: C.ink3, textAlign: 'center', marginTop: 24, marginBottom: 12 },
});
