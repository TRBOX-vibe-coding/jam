/**
 * 상위 노출 정렬 — 2026-09-10 픽스.
 *  1) 광고(AdSlot, 기간 내) rank 순으로 맨 위
 *  2) 나머지는 최근 30일 클릭수(EventLog *_view/_click) 많은 순
 *  3) 품절은 항상 맨 밑 (지우지 않고 홍보용으로 남긴다 — 삭제는 관리자에서)
 */
import { PrismaClient } from '@prisma/client';

/** 최근 30일 클릭수를 refId별로 집계한다. */
export async function clickCounts(db: PrismaClient, events: string[]): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.eventLog.groupBy({
    by: ['entityId'],
    where: { event: { in: events }, createdAt: { gte: since }, entityId: { not: null } },
    _count: { _all: true },
  });
  return new Map(rows.filter((r) => r.entityId).map((r) => [r.entityId!, r._count._all]));
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
