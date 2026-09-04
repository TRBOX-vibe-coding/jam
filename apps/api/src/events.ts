/**
 * 사용자 행동 로그 수집 — 향후 AI/분석 대비 (대표 요구 8번).
 * 앱이 이벤트를 모아서 배치로 보낸다. 실패해도 사용자 경험에 영향 없도록 조용히 저장만 한다.
 */
import { Body, Controller, Get, Module, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AdminGuard, AuthModule, OptionalUserGuard, UserId } from './auth';

class EventItemDto {
  @IsString() @MaxLength(64) event!: string;
  @IsOptional() @IsString() @MaxLength(32) entityType?: string;
  @IsOptional() @IsString() @MaxLength(64) entityId?: string;
  @IsOptional() @IsString() @MaxLength(8) lang?: string;
  @IsOptional() meta?: Record<string, unknown>;
}

class TrackDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => EventItemDto) events!: EventItemDto[];
  @IsOptional() @IsString() @MaxLength(64) anonId?: string;
}

@Controller('events')
export class EventsController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @UseGuards(OptionalUserGuard)
  async track(@UserId() userId: string | undefined, @Body() dto: TrackDto) {
    const events = (dto.events ?? []).slice(0, 50);
    if (events.length === 0) return { ok: true, saved: 0 };
    await this.prisma.client.eventLog.createMany({
      data: events.map((e) => ({
        userId: userId ?? null,
        anonId: dto.anonId ?? null,
        event: e.event,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        lang: e.lang ?? null,
        meta: (e.meta as any) ?? undefined,
      })),
    });
    return { ok: true, saved: events.length };
  }
}

/** 관리자 확인용 — 최근 로그와 이벤트별 집계(오늘/7일) */
@Controller('admin/events')
@UseGuards(AdminGuard)
export class AdminEventsController {
  constructor(private prisma: PrismaService) {}

  @Get('summary')
  async summary(@Query('days') days?: string) {
    const d = Math.min(Number(days) || 7, 90);
    const since = new Date(Date.now() - d * 86400_000);
    const rows = await this.prisma.client.eventLog.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const total = await this.prisma.client.eventLog.count();
    return { days: d, total, byEvent: rows.map((r) => ({ event: r.event, count: r._count._all })) };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [EventsController, AdminEventsController],
  providers: [PrismaService],
})
export class EventsModule {}
