import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** 웹 전용 HTML 셸 — Pretendard 폰트를 전역 적용한다 (미지정 시 브라우저가 Times 계열로 폴백하는 문제 방지) */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root, * {
            font-family: 'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic',
              'Apple SD Gothic Neo', system-ui, sans-serif;
          }
          body { background: #F4F7FA; }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
