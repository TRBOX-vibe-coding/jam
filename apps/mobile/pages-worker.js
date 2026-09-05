/**
 * Cloudflare Pages 프록시 워커 (유저 앱용) — expo export 후 dist/_worker.js 로 복사해서 배포한다.
 * 프론트는 항상 /api/... 만 부르고, 실제 API 터널 주소는 여기 한 줄에만 있다.
 * → 터널이 바뀌면 이 파일의 API 값만 바꾸고 dist에 복사 후 wrangler 재배포 (재빌드 불필요, 10초).
 */
const API = 'https://brain-collectible-won-feet.trycloudflare.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = API + url.pathname.slice(4) + url.search;
      return fetch(new Request(target, request));
    }
    // SPA: 정적 파일이 없으면 index.html 로 (expo-router 웹 싱글 페이지)
    let res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      res = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return res;
  },
};
