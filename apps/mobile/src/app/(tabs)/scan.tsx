/**
 * 매장에서 사용 — 매장 카운터의 고정 QR을 손님이 스캔한다.
 * 웹(데모)에서는 카메라 대신 코드 직접 입력을 지원한다.
 */
import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../lib/auth';
import { C } from '../../lib/theme';
import { Btn, Card, Screen } from '../../lib/ui';

export default function ScanScreen() {
  const { me } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [scanning, setScanning] = useState(false);
  const canCamera = Platform.OS !== 'web';

  function go(code: string) {
    const c = code.trim();
    if (!c) return;
    setScanning(false);
    router.push(`/use/${encodeURIComponent(c)}`);
  }

  if (!me) {
    return (
      <Screen>
        <View style={{ padding: 24 }}>
          <Card>
            <Text style={st.guide}>로그인 후 매장 QR을 스캔하면{'\n'}그 매장에서 쓸 수 있는 혜택이 바로 나옵니다.</Text>
            <Btn title="로그인하러 가기" onPress={() => router.push('/my')} />
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

        {canCamera ? (
          scanning ? (
            <View style={st.cameraWrap}>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => go(data)}
              />
              <View style={{ padding: 12 }}>
                <Btn title="닫기" tone="ghost" onPress={() => setScanning(false)} />
              </View>
            </View>
          ) : (
            <Btn
              title="📷  매장 QR 스캔하기"
              onPress={async () => {
                if (!permission?.granted) {
                  const r = await requestPermission();
                  if (!r.granted) return;
                }
                setScanning(true);
              }}
            />
          )
        ) : (
          <Card>
            <Text style={st.webNote}>웹 미리보기에서는 카메라 대신 코드를 직접 입력합니다.</Text>
          </Card>
        )}

        <Card style={{ marginTop: 12 }}>
          <Text style={st.manualLabel}>QR 코드 직접 입력</Text>
          <TextInput
            value={manual}
            onChangeText={setManual}
            placeholder="예: HG-CASABUSANO-a1b2c3"
            placeholderTextColor={C.ink3}
            autoCapitalize="none"
            style={st.input}
            onSubmitEditing={() => go(manual)}
          />
          <Btn title="확인" small onPress={() => go(manual)} />
        </Card>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 14, color: C.ink2, lineHeight: 21, marginBottom: 14, textAlign: 'center' },
  stepTitle: { fontSize: 13, fontWeight: '800', color: C.brand, marginBottom: 6 },
  step: { fontSize: 13, color: C.ink2, lineHeight: 22 },
  cameraWrap: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  webNote: { fontSize: 13, color: C.ink3, textAlign: 'center' },
  manualLabel: { fontSize: 12, fontWeight: '700', color: C.ink3, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.ink, marginBottom: 10, backgroundColor: C.white,
  },
});
