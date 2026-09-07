/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // 전 페이지가 클라이언트 컴포넌트라 정적 내보내기 가능 — Cloudflare Pages로 배포한다
  output: 'export',
};
