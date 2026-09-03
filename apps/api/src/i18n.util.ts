/**
 * 콘텐츠 다국어 응답.
 * 각 모델의 i18n Json 컬럼에 { en: {필드:번역}, zh: {...}, ja: {...} } 형태로 저장하고,
 * 클라이언트가 x-lang 헤더(en/zh/ja)를 보내면 전역 인터셉터가 응답을 걸어
 * i18n[lang]의 값으로 원문 필드를 덮어쓴 뒤 i18n 키를 제거한다.
 * 번역이 없는 항목은 원문(한국어) 그대로 나간다. /admin·/merchant 경로는 원문 유지.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type ContentLang = 'en' | 'zh' | 'ja';

export function langOf(req: { headers?: Record<string, unknown> }): ContentLang | null {
  const l = String(req?.headers?.['x-lang'] ?? '').toLowerCase();
  return l === 'en' || l === 'zh' || l === 'ja' ? (l as ContentLang) : null;
}

/** 단일 필드 번역 — 수동으로 응답을 조립하는 엔드포인트용 */
export function trField(entity: any, field: string, lang: ContentLang | null): any {
  const v = lang ? entity?.i18n?.[lang]?.[field] : null;
  return v != null && v !== '' ? v : entity?.[field];
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return (
    v !== null &&
    typeof v === 'object' &&
    !(v instanceof Date) &&
    (v.constructor === Object || v.constructor === undefined)
  );
}

/** 응답 트리를 걸어 i18n을 적용하고 제거한다 (제자리 변형) */
export function deepI18n(node: any, lang: ContentLang | null): any {
  if (Array.isArray(node)) {
    for (const item of node) deepI18n(item, lang);
    return node;
  }
  if (!isPlainObject(node)) return node;

  const i18n = node.i18n;
  if (i18n && typeof i18n === 'object') {
    if (lang && isPlainObject(i18n[lang])) {
      for (const [k, v] of Object.entries(i18n[lang])) {
        if (v != null && v !== '') node[k] = v;
      }
    }
    delete node.i18n;
  }
  for (const v of Object.values(node)) deepI18n(v, lang);
  return node;
}

@Injectable()
export class I18nInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const url: string = req?.url ?? '';
    // 운영자 화면(관리자·점주)은 원문 그대로
    if (url.startsWith('/admin') || url.startsWith('/merchant/') || url === '/merchant') {
      return next.handle();
    }
    const lang = langOf(req);
    return next.handle().pipe(map((data) => deepI18n(data, lang)));
  }
}
