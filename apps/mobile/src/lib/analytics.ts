/**
 * 행동 로그 수집 — 향후 AI/추천/분석 대비 (개발 검토사항 8번).
 * 이벤트를 모아서 3초마다(또는 10개 차면) 배치 전송한다.
 * 전송 실패는 조용히 무시 — 사용자 경험에 절대 영향을 주지 않는다.
 */
import { api, getApiLang } from './api';

type Ev = { event: string; entityType?: string; entityId?: string; meta?: Record<string, unknown>; lang?: string };

const queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function anonId(): string {
  try {
    let id = localStorage.getItem('hg_anon');
    if (!id) {
      id = 'a_' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('hg_anon', id);
    }
    return id;
  } catch {
    return 'a_mem';
  }
}

async function flush() {
  timer = null;
  const events = queue.splice(0, 50);
  if (events.length === 0) return;
  try {
    await api('/events', { method: 'POST', body: { events, anonId: anonId() } });
  } catch {
    /* 로그는 유실돼도 된다 */
  }
}

export function track(event: string, entity?: { type?: string; id?: string }, meta?: Record<string, unknown>) {
  queue.push({ event, entityType: entity?.type, entityId: entity?.id, meta, lang: getApiLang() });
  if (queue.length >= 10) {
    if (timer) clearTimeout(timer);
    flush();
    return;
  }
  if (!timer) timer = setTimeout(flush, 3000);
}
