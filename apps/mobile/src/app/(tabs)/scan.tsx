/**
 * 매장에서 사용 — 매장 카운터의 고정 QR을 손님이 카메라로 스캔한다.
 * 실서비스 동선은 카메라 스캔이 기본. 코드 직접 입력은 QR 훼손·카메라 불가 시 백업이다.
 * 웹에서도 같은 버튼으로 스캔한다(lib/qr-scanner.web.tsx — 브라우저 BarcodeDetector).
 */
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { QrScanner } from '../../lib/qr-scanner';
import { C } from '../../lib/theme';
import { Btn, Card, Screen } from '../../lib/ui';

export default function ScanScreen() {
  const { me } = useAuth();
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);
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
        setScanError(t('camPerm'));
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
            <Text style={st.guide}>{t('scanLoginGuide')}</Text>
            <Btn title={t('goLogin')} onPress={() => router.push('/(tabs)/my')} />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: 16, flex: 1 }}>
        <Card>
          <Text style={st.stepTitle}>{t('howToUse')}</Text>
          <Text style={st.step}>{t('step1')}</Text>
          <Text style={st.step}>{t('step2')}</Text>
          <Text style={st.step}>{t('step3')}</Text>
        </Card>

        {scanning ? (
          <View style={st.cameraWrap}>
            <View style={{ flex: 1 }}>
              <QrScanner
                onScan={go}
                onError={(msg) => {
                  setScanning(false);
                  setScanError(msg);
                }}
              />
              {/* 스캔 가이드 — 셔터 버튼을 찾지 않도록 "자동 인식"임을 화면에서 알려준다 */}
              <View pointerEvents="none" style={st.scanOverlay}>
                <View style={st.scanFrame} />
                <View style={st.scanGuideBox}>
                  <Text style={st.scanGuide}>{t('scanFrameGuide')}</Text>
                  <Text style={st.scanGuideSub}>{t('scanAuto')}</Text>
                </View>
              </View>
            </View>
            <View style={{ padding: 12 }}>
              <Btn title={t('close')} tone="ghost" onPress={() => setScanning(false)} />
            </View>
          </View>
        ) : (
          <Pressable style={st.scanBtn} onPress={openScanner}>
            <Ionicons name="scan-outline" size={20} color="#fff" />
            <Text style={st.scanBtnText}>{t('scanBtn')}</Text>
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
            <Text style={st.manualLabel}>{t('manualLabel')}</Text>
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
              <View style={{ flex: 1 }}><Btn title={t('confirm')} small onPress={() => go(manual)} /></View>
              <Btn title={t('close')} small tone="ghost" onPress={() => setShowManual(false)} />
            </View>
          </Card>
        ) : (
          <Pressable style={st.manualLink} onPress={() => setShowManual(true)}>
            <Text style={st.manualLinkText}>{t('scanFallback')}</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  guide: { fontSize: 14, color: C.ink2, lineHeight: 21, marginBottom: 14, textAlign: 'center' },
  stepTitle: { fontSize: 13, fontWeight: '700', color: C.brand, marginBottom: 6 },
  step: { fontSize: 13, color: C.ink2, lineHeight: 22 },
  cameraWrap: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  scanFrame: {
    width: 208, height: 208, borderRadius: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.92)',
  },
  scanGuideBox: {
    backgroundColor: 'rgba(18,24,31,0.72)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9,
    alignItems: 'center', gap: 2,
  },
  scanGuide: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scanGuideSub: { color: '#CFE8F8', fontSize: 12, fontWeight: '600' },
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
