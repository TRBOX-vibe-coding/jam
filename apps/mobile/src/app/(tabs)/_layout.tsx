import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused, color }: { focused: boolean; color: any }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color} />
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: '#9AA7B3',
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700', marginTop: 1 },
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.line, height: 60, paddingTop: 6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          tabBarLabel: t('tabHome'),
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      {/* DROP은 하단 탭에서 빼고 홈 섹션으로만 노출 (2026-09-09 픽스). 라우트는 전체보기용으로 유지 */}
      <Tabs.Screen
        name="drops"
        options={{
          title: t('titleDrops'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: t('titleStore'),
          tabBarLabel: t('tabStore'),
          tabBarIcon: tabIcon('pricetags', 'pricetags-outline'),
        }}
      />
      {/* 잼 구매는 하단바로 (2026-09-18 대표 확정) — MY 안쪽에 있으면 못 찾는다 */}
      <Tabs.Screen
        name="jam"
        options={{
          title: t('titleJam'),
          tabBarLabel: t('tabJam'),
          tabBarIcon: tabIcon('diamond', 'diamond-outline'),
        }}
      />
      {/* 일정은 탭에서 빼고 잼 탭·MY에서 들어간다. 라우트는 그대로 쓴다 */}
      <Tabs.Screen
        name="trip"
        options={{
          title: t('titleTrip'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('titleScan'),
          tabBarLabel: t('tabScan'),
          tabBarIcon: tabIcon('ticket', 'ticket-outline'),
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: t('tabMy'),
          tabBarLabel: t('tabMy'),
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
    </Tabs>
  );
}
