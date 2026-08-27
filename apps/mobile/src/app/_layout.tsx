import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';
import { C } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: C.ink,
          headerStyle: { backgroundColor: C.white },
          headerTitleStyle: { fontWeight: '700', fontSize: 16 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.ground },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="drop/[id]" options={{ title: 'DROP' }} />
        <Stack.Screen name="product/[id]" options={{ title: '상품' }} />
        <Stack.Screen name="use/[qr]" options={{ title: '매장에서 사용' }} />
        <Stack.Screen name="done" options={{ title: '사용 완료', headerBackVisible: false }} />
        <Stack.Screen name="merchant" options={{ title: '가맹점 모드' }} />
      </Stack>
    </AuthProvider>
  );
}
