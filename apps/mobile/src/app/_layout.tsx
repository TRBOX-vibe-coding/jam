import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { AuthProvider } from '../lib/auth';
import { I18nProvider, useI18n } from '../lib/i18n';
import { C } from '../lib/theme';

/**
 * 웹 전용 Pretendard 폰트 주입.
 * RN 웹의 기본 font-family는 'System'이라 브라우저가 세리프(Times)로 폴백하는
 * 환경이 있다 — 전역 스타일로 Pretendard를 강제한다.
 */
function useWebFont() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('hg-font')) return;
    const style = document.createElement('style');
    style.id = 'hg-font';
    // RN웹은 모든 텍스트에 font-family: System을 지정한다. 'System'이라는 이름의
    // 폰트페이스를 Pretendard로 직접 정의해 매핑한다 — 이러면 아이콘 폰트(Ionicons)는
    // 건드리지 않으면서 일반 텍스트만 Pretendard로 렌더된다.
    style.textContent = `
      @font-face {
        font-family: 'System';
        src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations');
        font-weight: 45 920;
        font-style: normal;
        font-display: swap;
      }
      html, body {
        font-family: 'System', Pretendard, -apple-system, 'Malgun Gothic',
          'Apple SD Gothic Neo', system-ui, sans-serif;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

/**
 * 웹 전용 자동 업데이트.
 * 새 버전을 배포해도 이미 열려 있는 탭은 옛 화면을 계속 쓴다 —
 * 탭에 다시 돌아왔을 때(또는 5분마다) 배포된 번들이 바뀌었으면 스스로 새로고침한다.
 */
function useWebAutoUpdate() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const cur = (document.querySelector('script[src*="/_expo/static/js/web/entry-"]') as any)?.src as string | undefined;
    if (!cur) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const html = await fetch('/', { cache: 'no-cache' }).then((r) => r.text());
        const m = html.match(/\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/);
        if (m && !cur.includes(m[0])) window.location.reload();
      } catch {
        /* 오프라인 등 — 다음 기회에 다시 확인 */
      }
      busy = false;
    };
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const timer = setInterval(check, 5 * 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(timer); };
  }, []);
}

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

/** Stack 타이틀은 언어 설정을 따라간다 (가맹점 화면은 운영자용이라 한국어 고정) */
function AppStack() {
  const { t } = useI18n();
  return (
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
      <Stack.Screen name="benefits" options={{ title: t('titleBenefits') }} />
      <Stack.Screen name="wallet" options={{ title: t('titleWallet') }} />
      <Stack.Screen name="store/[id]" options={{ title: t('titleStoreDetail') }} />
      <Stack.Screen name="product/[id]" options={{ title: t('titleProduct') }} />
      <Stack.Screen name="use/[qr]" options={{ title: t('titleScan') }} />
      <Stack.Screen name="done" options={{ title: t('titleDone'), headerBackVisible: false }} />
      <Stack.Screen name="merchant" options={{ title: '가맹점 모드' }} />
      <Stack.Screen name="merchant-drop" options={{ title: 'DROP 등록' }} />
      <Stack.Screen name="apply" options={{ title: '입점 신청' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useWebFont();
  useWebAutoUpdate();
  return (
    <AuthProvider>
      <I18nProvider>
        <StatusBar style="dark" />
        <PhoneFrame>
          <AppStack />
        </PhoneFrame>
      </I18nProvider>
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
