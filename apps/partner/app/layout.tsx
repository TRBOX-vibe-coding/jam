import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '홀릭잼 사장님',
  description: '홀릭잼 가맹점 관리 — 판매 현황·예약·상품 등록',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
