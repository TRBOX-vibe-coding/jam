import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HOLIC GEM 관리자',
  description: '홀릭잼 본사 관리자',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
