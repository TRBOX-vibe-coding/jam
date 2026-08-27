/**
 * QR 스캐너 — 네이티브(iOS·Android)는 expo-camera를 쓴다.
 * 웹에서는 qr-scanner.web.tsx 가 대신 로드된다(expo-camera가 웹 바코드 인식을 지원하지 않음).
 */
import { CameraView } from 'expo-camera';

export function QrScanner({
  onScan,
}: {
  onScan: (code: string) => void;
  onError?: (msg: string) => void;
}) {
  return (
    <CameraView
      style={{ flex: 1 }}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }) => data && onScan(data)}
    />
  );
}
