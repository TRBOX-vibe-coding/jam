import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { AuthProvider } from '../lib/auth';
import { C } from '../lib/theme';

/**
 * 웹 미리보기용 폰 프레임.
 * 실제 제품은 폰 앱이므로, 데스크톱 브라우저에서 볼 때도
 * 폰 폭(420px)으로 가운데 고정해 실제 앱과 같은 비율로 보이게 한다.
 * 네이티브(iOS/Android)에서는 그대로 전체 화면.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={fs.outer}>
      <View style={fs.phone}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <PhoneFrame>
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
          <Stack.Screen name="benefits" options={{ title: '내 혜택' }} />
          <Stack.Screen name="wallet" options={{ title: '이용권 · 예약' }} />
          <Stack.Screen name="store/[id]" options={{ title: '매장' }} />
          <Stack.Screen name="product/[id]" options={{ title: '상품' }} />
          <Stack.Screen name="use/[qr]" options={{ title: '매장에서 사용' }} />
          <Stack.Screen name="done" options={{ title: '사용 완료', headerBackVisible: false }} />
          <Stack.Screen name="merchant" options={{ title: '가맹점 모드' }} />
        </Stack>
      </PhoneFrame>
    </AuthProvider>
  );
}

const fs = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#E7EDF2',
  },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.ground,
    // 데스크톱에서 폰 영역이 또렷이 구분되도록
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: '#C9D4DD',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 40px rgba(16,24,32,0.10)' as never }
      : {}),
  },
});
