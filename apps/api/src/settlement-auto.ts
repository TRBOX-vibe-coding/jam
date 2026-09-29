/**
 * 정산 저절로 만들기 — 본사가 설정에서 정한 주기대로, 기간이 끝나면 가게마다 정산을 만든다 (2026-09-29).
 * 서버가 켜질 때 한 번, 그 뒤로 한 시간마다 가장 최근에 끝난 기간을 본다. 이미 있는 정산은 건드리지 않는다.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { endedPeriods, getSettlementPolicy, saveSettlements } from './settlement.util';

const HOUR = 60 * 60 * 1000;

@Injectable()
export class SettlementAutoService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private first: ReturnType<typeof setTimeout> | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.first = setTimeout(() => void this.run(), 15_000);
    this.timer = setInterval(() => void this.run(), HOUR);
  }

  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    try {
      const db = this.prisma.client;
      const policy = await getSettlementPolicy(db);
      const [last] = endedPeriods(policy.cycle, new Date(), 1);
      const r = await saveSettlements(db, last, { onlyMissing: true });
      if (r.created > 0) {
        const d = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`;
        console.log(`[정산] ${d(last.start)}~${d(new Date(last.end.getTime() - 1))} 정산 ${r.created}건을 저절로 만들었습니다`);
      }
    } catch (e) {
      console.error('[정산] 저절로 만들기 실패', e);
    }
  }
}
