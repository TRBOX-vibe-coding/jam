/**
 * 내 혜택 — 쿠폰을 "찾아서 받는" 화면이 아니라, 이미 열려 있는 것을 보는 화면.
 * 상단에 절약 요약(멤버십 가치의 증거)을 먼저 보여준다.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { C } from '../lib/theme';
import { Btn, Card, EmptyText, Loading, Screen, Tag } from '../lib/ui';

type BenefitGroup = {
  merchant: { id: string; name: string; address: string | null; region: { name: string }; category: { name: string; emoji: string } };
  items: { id: string; title: string; type: string; freebieName: string | null; validTo: string | null; sourceType: string }[];
};

const SOURCE_KEY: Record<string, string> = {
  MEMBERSHIP_PLAN: 'srcMembership',
  PRODUCT: 'srcProduct',
  REGION_PASS: 'srcRegionPass',
  MANUAL: 'srcManual',
};

export default function BenefitsScreen() {
  const { me } = useAuth();
  const { t, won, locale } = useI18n();
  const [data, setData] = useState<{ totalCount: number; merchants: BenefitGroup[] } | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      setError('');
      api<{ totalCount: number; merchants: BenefitGroup[] }>('/me/benefits')
        .then(setData)
        .catch((e) => setError(e.message));
    }, []),
  );

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

        {data?.merchants.map((g) => (
          <Card key={g.merchant.id}>
            <View style={st.rowBetween}>
              <Text style={st.merchantName}>
                {g.merchant.category.emoji} {g.merchant.name}
              </Text>
              <Text style={st.region}>{g.merchant.region.name}</Text>
            </View>
            {g.items.map((b) => (
              <View key={b.id} style={st.benefitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.benefitTitle}>{b.title}</Text>
                  {b.validTo && (
                    <Text style={st.validTo}>
                      {t('untilDate', { date: new Date(b.validTo).toLocaleDateString(locale) })}
                    </Text>
                  )}
                </View>
                <Tag text={SOURCE_KEY[b.sourceType] ? t(SOURCE_KEY[b.sourceType]) : b.sourceType} tone="ok" />
              </View>
            ))}
          </Card>
        ))}

        {data && data.totalCount > 0 && (
          <Text style={st.hint}>{t('benefitsHint')}</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savingLabel: { color: '#CFE1F2', fontSize: 12, fontWeight: '700' },
  savingValue: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', marginTop: 3, letterSpacing: -0.5 },
  savingSub: { color: '#BCD6EC', fontSize: 12, fontWeight: '600' },
  merchantName: { fontSize: 15, fontWeight: '700', color: C.ink },
  region: { fontSize: 12, color: C.ink3 },
  benefitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, marginTop: 10,
  },
  benefitTitle: { fontSize: 14, fontWeight: '600', color: C.ink2 },
  validTo: { fontSize: 11, color: C.ink3, marginTop: 1 },
  hint: { textAlign: 'center', color: C.ink3, fontSize: 12, marginTop: 8, marginBottom: 24 },
});
