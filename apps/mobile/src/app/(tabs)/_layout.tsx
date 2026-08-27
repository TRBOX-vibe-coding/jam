import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '../../lib/theme';

function Icon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.ink3,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.line, height: 58, paddingTop: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          tabBarLabel: '홈',
          tabBarIcon: ({ focused }) => <Icon glyph="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="drops"
        options={{
          title: '오늘의 DROP',
          tabBarLabel: 'DROP',
          tabBarIcon: ({ focused }) => <Icon glyph="⚡" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: '매장에서 사용',
          tabBarLabel: '사용',
          tabBarIcon: ({ focused }) => <Icon glyph="📷" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: '이용권 · 예약',
          tabBarLabel: '이용권',
          tabBarIcon: ({ focused }) => <Icon glyph="🎫" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: 'MY',
          tabBarLabel: 'MY',
          tabBarIcon: ({ focused }) => <Icon glyph="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
