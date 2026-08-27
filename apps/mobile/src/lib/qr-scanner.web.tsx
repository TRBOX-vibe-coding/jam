/**
 * QR 스캐너 (웹 전용) — expo-camera가 웹에서 바코드 인식을 지원하지 않아 직접 구현한다.
 * 인식 엔진: 브라우저 내장 BarcodeDetector가 실제 동작하면 그걸 쓰고(안드로이드 크롬 등),
 * 아니면 jsQR로 프레임을 디코딩한다(윈도우 데스크톱 크롬 포함 전 브라우저 동작).
 * 카메라를 못 여는 경우에만 onError 로 코드 직접 입력을 안내한다.
 */
import React, { useEffect, useRef } from 'react';
import jsQR from 'jsqr';

async function makeDetector(): Promise<(video: any) => Promise<string | null>> {
  const BD = (globalThis as any).BarcodeDetector;
  try {
    if (BD) {
      const formats: string[] = await BD.getSupportedFormats();
      if (formats?.includes('qr_code')) {
        const d = new BD({ formats: ['qr_code'] });
        return async (video) => {
          const codes = await d.detect(video);
          return codes?.[0]?.rawValue ?? null;
        };
      }
    }
  } catch {
    // BarcodeDetector가 정의만 되고 동작하지 않는 환경 — jsQR로 넘어간다.
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return async (video) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    // 인식 속도를 위해 긴 변을 640px로 줄여서 디코딩한다.
    const scale = Math.min(1, 640 / Math.max(vw, vh));
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height);
    return code?.data ?? null;
  };
}

export function QrScanner({
  onScan,
  onError,
}: {
  onScan: (code: string) => void;
  onError?: (msg: string) => void;
}) {
  const videoRef = useRef<any>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: any = null;
    let timer: any = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await (navigator as any).mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        onError?.('카메라를 열 수 없어요. 브라우저의 카메라 권한을 허용하거나 아래에 코드를 입력해 주세요.');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t: any) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      const detect = await makeDetector();
      timer = setInterval(async () => {
        const v = videoRef.current;
        if (doneRef.current || !v || v.readyState < 2) return;
        try {
          const raw = await detect(v);
          if (raw) {
            doneRef.current = true;
            onScan(raw);
          }
        } catch {
          // 프레임 단위 인식 실패는 무시하고 계속 시도한다.
        }
      }, 250);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks?.().forEach((t: any) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return React.createElement('video' as any, {
    ref: videoRef,
    autoPlay: true,
    muted: true,
    playsInline: true,
    style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
  });
}
