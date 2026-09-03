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
      <Tabs.Screen
        name="drops"
        options={{
          title: t('titleDrops'),
          tabBarLabel: t('tabDrop'),
          tabBarIcon: tabIcon('flash', 'flash-outline'),
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
      <Tabs.Screen
        name="scan"
        options={{
          title: t('titleScan'),
          tabBarLabel: t('tabScan'),
          tabBarIcon: tabIcon('qr-code', 'qr-code-outline'),
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
