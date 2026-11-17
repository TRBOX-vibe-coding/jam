/**
 * Cloudflare Pages 프록시 워커 (유저 앱용) — expo export 후 dist/_worker.js 로 복사해서 배포한다.
 * 프론트는 항상 /api/... 만 부르고, 실제 API 터널 주소는 여기 한 줄에만 있다.
 * → 터널이 바뀌면 이 파일의 API 값만 바꾸고 dist에 복사 후 wrangler 재배포 (재빌드 불필요, 10초).
 */
const API = 'https://one-pharmacy-state-translated.trycloudflare.com';

// 파일 이름에 내용 해시가 들어 있는 정적 파일(JS·아이콘 폰트·이미지)은 내용이 바뀌면 이름도 바뀐다.
// 그래서 브라우저가 매번 "바뀌었나?" 확인하지 않고 영구 보관해도 된다. (index.html 은 해당 없음)
const HASHED_STATIC = /^\/(_expo\/static|assets)\//;

// 업로드 이미지(/api/uploads/<이름>?w=폭)는 이름이 유니크해서 한 번 만들면 바뀌지 않는다.
// 요청마다 터널(집 PC)까지 오지 않도록 엣지에 7일 보관하고, 브라우저에는 영구 보관을 알린다.
const UPLOAD_IMAGE = /^\/api\/uploads\/[A-Za-z0-9._-]+$/;
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=604800, immutable';

async function cachedUploadImage(request, target, ctx) {
  const cache = caches.default;
  // 요청 헤더는 무시하고 주소(폭 포함)로만 구분한다
  const key = new Request(request.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    const out = new Response(hit.body, hit);
    out.headers.set('x-edge-cache', 'HIT');
    return out;
  }
  const res = await fetch(target);
  if (res.status !== 200) return res; // 없는 이미지·서버 오류는 보관하지 않는다
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', IMAGE_CACHE_CONTROL);
  ctx.waitUntil(cache.put(key, out.clone()));
  out.headers.set('x-edge-cache', 'MISS'); // 점검용: 엣지에서 바로 줬는지(HIT) 집까지 다녀왔는지(MISS)
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = API + url.pathname.slice(4) + url.search;
      if (request.method === 'GET' && UPLOAD_IMAGE.test(url.pathname)) {
        return cachedUploadImage(request, target, ctx);
      }
      return fetch(new Request(target, request));
    }
    // SPA: 정적 파일이 없으면 index.html 로 (expo-router 웹 싱글 페이지)
    let res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      res = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    } else if (HASHED_STATIC.test(url.pathname) && (res.status === 200 || res.status === 304)) {
      res = new Response(res.body, res);
      res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
    return res;
  },
};
