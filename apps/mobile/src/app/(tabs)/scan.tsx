/**
 * 매장에서 사용 — 매장 카운터의 고정 QR을 손님이 카메라로 스캔한다.
 * 실서비스 동선은 카메라 스캔이 기본. 코드 직접 입력은 QR 훼손·카메라 불가 시 백업이다.
 * 웹에서도 같은 버튼으로 스캔한다(lib/qr-scanner.web.tsx — 브라우저 BarcodeDetector).
 */
import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../lib/auth';
import { QrScanner } from '../../lib/qr-scanner';
import { C } from '../../lib/theme';
import { Btn, Card, Screen } from '../../lib/ui';

export default function ScanScreen() {
  const { me } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  function go(code: string) {
    const c = code.trim();
    if (!c) return;
    setScanning(false);
    router.push(`/use/${encodeURIComponent(c)}`);
  }

  async function openScanner() {
    setScanError(null);
    // 웹은 getUserMedia 시점에 브라우저가 직접 권한을 묻는다.
    if (Platform.OS !== 'web' && !permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        setScanError('카메라 권한이 필요해요. 설정에서 카메라를 허용해 주세요.');
        return;
      }
    }
    setScanning(true);
  }

  if (!me) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <Card>
            <Text style={st.guide}>로그인 후 매장 QR을 스캔하면{'\n'}그 매장에서 쓸 수 있는 혜택이 바로 나옵니다.</Text>
            <Btn title="로그인하러 가기" onPress={() => router.push('/(tabs)/my')} />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: 16, flex: 1 }}>
        <Card>
          <Text style={st.stepTitle}>사용 방법</Text>
          <Text style={st.step}>1. 매장 카운터의 홀릭잼 QR을 찾으세요</Text>
          <Text style={st.step}>2. 아래 버튼으로 스캔하세요</Text>
          <Text style={st.step}>3. 쓸 혜택을 고르고 직원에게 완료화면을 보여주세요</Text>
        </Card>

        {scanning ? (
          <View style={st.cameraWrap}>
            <QrScanner
              onScan={go}
              onError={(msg) => {
                setScanning(false);
                setScanError(msg);
              }}
            />
            <View style={{ padding: 12 }}>
              <Btn title="닫기" tone="ghost" onPress={() => setScanning(false)} />
            </View>
          </View>
        ) : (
          <Pressable style={st.scanBtn} onPress={openScanner}>
            <Ionicons name="scan-outline" size={20} color="#fff" />
            <Text style={st.scanBtnText}>매장 QR 스캔하기</Text>
          </Pressable>
        )}

        {scanError && (
          <Card style={{ marginTop: 12 }}>
            <Text style={st.errorNote}>{scanError}</Text>
          </Card>
        )}

        {/* 수동 입력은 평소엔 텍스트 한 줄만. 누르면 입력창이 열린다 */}
        {showManual ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={st.manualLabel}>매장 QR 아래에 적힌 코드를 입력하세요</Text>
            <TextInput
              value={manual}
              onChangeText={setManual}
              placeholder="예: HG-CASABUSANO-a1b2c3"
              placeholderTextColor={C.ink3}
              autoCapitalize="none"
              autoFocus
              style={st.input}
              onSubmitEditing={() => go(manual)}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Btn title="확인" small onPress={() => go(manual)} /></View>
              <Btn title="닫기" small tone="ghost" onPress={() => setShowManual(false)} />
            </View>
          </Card>
        ) : (
          <Pressable style={st.manualLink} onPress={() => setShowManual(true)}>
            <Text style={st.manualLinkText}>QR을 스캔할 수 없나요?</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 14, color: C.ink2, lineHeight: 21, marginBottom: 14, textAlign: 'center' },
  stepTitle: { fontSize: 13, fontWeight: '800', color: C.brand, marginBottom: 6 },
  step: { fontSize: 13, color: C.ink2, lineHeight: 22 },
  cameraWrap: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  errorNote: { fontSize: 13, color: C.warn, textAlign: 'center' },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.brand, borderRadius: 13, paddingVertical: 15,
  },
  scanBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  manualLink: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  manualLinkText: { fontSize: 13, color: C.ink3, textDecorationLine: 'underline' },
  manualLabel: { fontSize: 12, fontWeight: '700', color: C.ink3, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.ink, marginBottom: 10, backgroundColor: C.white,
  },
});
