import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
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
          tabBarLabel: '홈',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="drops"
        options={{
          title: '오늘의 DROP',
          tabBarLabel: 'DROP',
          tabBarIcon: tabIcon('flash', 'flash-outline'),
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: '제휴 혜택',
          tabBarLabel: '혜택',
          tabBarIcon: tabIcon('pricetags', 'pricetags-outline'),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: '매장에서 사용',
          tabBarLabel: '사용',
          tabBarIcon: tabIcon('qr-code', 'qr-code-outline'),
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: 'MY',
          tabBarLabel: 'MY',
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
    </Tabs>
  );
}
