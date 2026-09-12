/**
 * 상위 노출 정렬 — 2026-09-10 픽스.
 *  1) 광고(AdSlot, 기간 내) rank 순으로 맨 위
 *  2) 나머지는 최근 30일 활동 점수 — 조회 1점, 받기 3점, 결제·현장 사용 5점 (RANK_WEIGHTS)
 *  3) 품절은 항상 맨 밑 (지우지 않고 홍보용으로 남긴다 — 삭제는 관리자에서)
 */
import { PrismaClient } from '@prisma/client';

/**
 * 랭킹 점수 가중치 — 2026-09-12 대표 요구로 분리했다.
 * "클릭수 30일만으로 확정하지 않는다. 나중에 실제 사용량 비중을 올릴 수 있게" →
 * 여기 숫자만 바꾸면 전체 랭킹이 따라 바뀐다. 이벤트 이름의 마지막 토큰으로 고른다.
 */
export const RANK_WEIGHTS: Record<string, number> = {
  view: 1,
  click: 1,
  claim: 3,
  purchase: 5,
  redeem: 5,
};

/** 모르는 이벤트는 1점으로 센다. */
function weightOf(event: string): number {
  return RANK_WEIGHTS[event.split('_').pop() ?? ''] ?? 1;
}

/** 최근 30일 활동 점수를 refId별로 집계한다 (조회는 1점, 결제·현장 사용은 5점). */
export async function clickCounts(db: PrismaClient, events: string[]): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.eventLog.groupBy({
    by: ['entityId', 'event'],
    where: { event: { in: events }, createdAt: { gte: since }, entityId: { not: null } },
    _count: { _all: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.entityId) continue;
    m.set(r.entityId, (m.get(r.entityId) ?? 0) + r._count._all * weightOf(r.event));
  }
  return m;
}

/** 지금 기간 안에 있는 광고 자리: "TYPE:refId" → rank */
export async function activeAdRanks(db: PrismaClient): Promise<Map<string, number>> {
  const now = new Date();
  const rows = await db.adSlot.findMany({
    where: { startAt: { lte: now }, endAt: { gte: now } },
    select: { itemType: true, refId: true, rank: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.itemType}:${r.refId}`;
    if (!m.has(key) || m.get(key)! > r.rank) m.set(key, r.rank);
  }
  return m;
}

/** 광고 → 클릭수 → 품절 맨밑 순으로 정렬한다. 원본 배열을 바꾸지 않는다. */
export function rankSort<T>(
  rows: T[],
  opts: {
    id: (r: T) => string;
    soldOut?: (r: T) => boolean;
    clicks: Map<string, number>;
    ads?: Map<string, number>;
    adKey?: (r: T) => string; // "TYPE:refId"
  },
): T[] {
  return [...rows].sort((a, b) => {
    const soA = opts.soldOut?.(a) ? 1 : 0;
    const soB = opts.soldOut?.(b) ? 1 : 0;
    if (soA !== soB) return soA - soB;
    const adA = opts.ads && opts.adKey ? opts.ads.get(opts.adKey(a)) : undefined;
    const adB = opts.ads && opts.adKey ? opts.ads.get(opts.adKey(b)) : undefined;
    if (adA != null || adB != null) {
      if (adA == null) return 1;
      if (adB == null) return -1;
      if (adA !== adB) return adA - adB;
    }
    return (opts.clicks.get(opts.id(b)) ?? 0) - (opts.clicks.get(opts.id(a)) ?? 0);
  });
}
