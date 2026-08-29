import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * 웹 전용 HTML 셸.
 * RN웹은 모든 텍스트에 font-family: System을 지정하므로, 'System'이라는 이름의
 * 폰트페이스를 Pretendard로 정의해 매핑한다 — 아이콘 폰트(Ionicons)는 건드리지 않는다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @font-face {
                font-family: 'System';
                src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations');
                font-weight: 45 920;
                font-style: normal;
                font-display: swap;
              }
              html, body {
                font-family: 'System', Pretendard, -apple-system, 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif;
                background: #F4F7FA;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
