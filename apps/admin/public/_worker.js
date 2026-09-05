/**
 * Cloudflare Pages 프록시 워커.
 * 프론트는 항상 같은 주소(/api/...)만 부르고, 실제 API 터널 주소는 여기 한 줄에만 있다.
 * → 터널이 바뀌어도 프론트 재빌드 없이 이 파일의 API 값만 바꿔 재배포하면 끝 (10초).
 */
const API = 'https://brain-collectible-won-feet.trycloudflare.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = API + url.pathname.slice(4) + url.search;
      return fetch(new Request(target, request));
    }
    // 정적 자산 (clean URL: /membership → membership.html)
    let res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      res = await env.ASSETS.fetch(new Request(new URL(url.pathname + '.html', url), request));
    }
    return res;
  },
};
