/**
 * 기획전/공공사업 — 키마위크·밀락수변영화관·바다패스 같은 기간 한정 사업.
 *
 * 구조 (대표 확인 사항 반영):
 *  - 지자체 상품은 "관리자 페이지 전용" 등록 — 점주 앱에서는 못 만든다.
 *  - 지원금은 지자체→업체 직접 지급이므로 정산 엔진은 만들지 않는다.
 *    홀릭잼은 판매실적 엑셀만 뽑아 지자체에 증빙한다.
 *  - 상품마다 총 판매수량(자동 품절) + 1인 구매제한(1인 1장 체크)을 설정한다.
 *  - 앱 홈에는 활성 기획전이 배너로 노출된다 (노출 순서·기간 관리자 제어).
 *
 * 판매·사용은 기존 DROP(TICKET) 기계를 그대로 쓴다:
 * 관리자가 기획전 상품을 등록하면 내부적으로 Product + Drop(TICKET)이 만들어지고,
 * 결제→이용권 발급→매장 QR 사용까지 기존 흐름으로 돌아간다.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException,
  Param, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import * as XLSX from 'xlsx';
import { PrismaService } from './prisma.service';
import { AdminGuard, AdminId, AuthModule } from './auth';
import { langOf, trField } from './i18n.util';
import { saveImageDataUrl } from './uploads';

class CreateCampaignDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() bannerImageUrl?: string;
  @IsOptional() @IsString() bannerImageBase64?: string;
  @IsOptional() @IsString() subsidyLabel?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() endAt?: string;
}

class PatchCampaignDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() bannerImageUrl?: string;
  @IsOptional() @IsString() bannerImageBase64?: string;
  @IsOptional() @IsString() subsidyLabel?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() endAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateCampaignProductDto {
  @IsString() merchantId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(0) normalPrice!: number;
  @Type(() => Number) @IsInt() @Min(0) salePrice!: number;
  @Type(() => Number) @IsInt() @Min(1) totalQty!: number;
  /** 1인 1장 체크 — true면 maxPerUser=1 */
  @IsOptional() @IsBoolean() onePerUser?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPerUser?: number;
  @IsISO8601() closeAt!: string;
  @IsOptional() @IsString() imageBase64?: string;
  @IsOptional() @IsString() imageUrl?: string;
}

const CLAIM_STATUS_LABEL: Record<string, string> = {
  CLAIMED: '확정됨', RESERVED: '확정됨', USED: '사용완료', EXPIRED: '기간만료', CANCELLED: '취소됨',
};

@Controller('admin/campaigns')
@UseGuards(AdminGuard)
export class AdminCampaignController {
  constructor(private prisma: PrismaService) {}

  private audit(adminId: string, action: string, targetId: string, memo?: string) {
    return this.prisma.client.auditLog.create({
      data: { adminUserId: adminId, action, targetType: 'Campaign', targetId, memo },
    });
  }

  @Get()
  async list() {
    const rows = await this.prisma.client.campaign.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        drops: { select: { id: true, title: true, totalQty: true, remainingQty: true, dropPrice: true, status: true } },
      },
    });
    return rows.map((c) => {
      const sold = c.drops.reduce((s, d) => s + (d.totalQty - d.remainingQty), 0);
      const revenue = c.drops.reduce((s, d) => s + (d.totalQty - d.remainingQty) * d.dropPrice, 0);
      return { ...c, productCount: c.drops.length, soldQty: sold, soldAmount: revenue };
    });
  }

  @Post()
  async create(@AdminId() adminId: string, @Body() dto: CreateCampaignDto) {
    const bannerImageUrl = dto.bannerImageBase64
      ? saveImageDataUrl(dto.bannerImageBase64, 'campaign')
      : dto.bannerImageUrl ?? null;
    const c = await this.prisma.client.campaign.create({
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        bannerImageUrl,
        subsidyLabel: dto.subsidyLabel,
        sortOrder: dto.sortOrder ?? 0,
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        endAt: dto.endAt ? new Date(dto.endAt) : null,
      },
    });
    await this.audit(adminId, 'CAMPAIGN_CREATE', c.id, dto.title);
    return c;
  }

  @Patch(':id')
  async patch(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchCampaignDto) {
    const data: any = { ...dto };
    delete data.bannerImageBase64;
    if (dto.bannerImageBase64) data.bannerImageUrl = saveImageDataUrl(dto.bannerImageBase64, 'campaign');
    if (dto.startAt) data.startAt = new Date(dto.startAt);
    if (dto.endAt) data.endAt = new Date(dto.endAt);
    const c = await this.prisma.client.campaign.update({ where: { id }, data });
    await this.audit(adminId, 'CAMPAIGN_UPDATE', id, JSON.stringify(dto).slice(0, 180));
    return c;
  }

  @Delete(':id')
  async remove(@AdminId() adminId: string, @Param('id') id: string) {
    const sold = await this.prisma.client.dropClaim.count({ where: { drop: { campaignId: id } } });
    if (sold > 0) {
      // 판매 이력이 있으면 삭제 대신 비활성 — 실적 증빙이 사라지면 안 된다
      await this.prisma.client.campaign.update({ where: { id }, data: { isActive: false } });
      await this.audit(adminId, 'CAMPAIGN_CLOSE', id, `판매 ${sold}건 존재 → 종료 처리`);
      return { message: `판매 이력 ${sold}건이 있어 삭제 대신 종료 처리했습니다` };
    }
    await this.prisma.client.campaign.delete({ where: { id } });
    await this.audit(adminId, 'CAMPAIGN_DELETE', id);
    return { message: '기획전을 삭제했습니다' };
  }

  /** 지자체 상품 등록 — 관리자 전용. Product + Drop(TICKET)을 한 번에 만든다. */
  @Post(':id/products')
  async addProduct(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: CreateCampaignProductDto) {
    const db = this.prisma.client;
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('기획전을 찾을 수 없습니다');
    const merchant = await db.merchant.findFirst({ where: { id: dto.merchantId, status: 'ACTIVE' } });
    if (!merchant) throw new BadRequestException('운영 중인 가맹점을 선택해 주세요');
    if (dto.salePrice > dto.normalPrice) throw new BadRequestException('판매가가 정가보다 클 수 없습니다');

    const closeAt = new Date(dto.closeAt);
    if (closeAt <= new Date()) throw new BadRequestException('마감 시각이 이미 지났습니다');
    const imageUrl = dto.imageBase64 ? saveImageDataUrl(dto.imageBase64, 'campaign') : dto.imageUrl ?? null;
    const maxPerUser = dto.onePerUser ? 1 : (dto.maxPerUser ?? 10);

    return db.$transaction(async (tx) => {
      // 사용처리(QR)용 상품 — 캠페인 전용이라 일반 상품 목록에는 숨긴다(isActive:false)
      const product = await tx.product.create({
        data: {
          merchantId: merchant.id,
          categoryId: merchant.categoryId,
          type: 'TICKET',
          name: dto.name,
          description: dto.description,
          imageUrl,
          basePrice: dto.normalPrice,
          approval: 'ACTIVE',
          isActive: false,
          campaignId: id,
        },
      });
      const drop = await tx.drop.create({
        data: {
          merchantId: merchant.id,
          regionId: merchant.regionId,
          categoryId: merchant.categoryId,
          productId: product.id,
          campaignId: id,
          kind: 'TICKET',
          status: 'OPEN',
          audience: 'ALL',
          title: dto.name,
          description: dto.description,
          imageUrl,
          normalPrice: dto.normalPrice,
          dropPrice: dto.salePrice,
          totalQty: dto.totalQty,
          remainingQty: dto.totalQty,
          maxPerUser,
          openAt: new Date(),
          closeAt,
        },
      });
      await this.audit(adminId, 'CAMPAIGN_PRODUCT_CREATE', id, `${dto.name} · 총 ${dto.totalQty}장 · 1인 ${maxPerUser}장`);
      return { ok: true, dropId: drop.id, productId: product.id };
    });
  }

  /** 판매실적 엑셀 — 지자체 제출용. 취소 건은 상태로 구분된다. */
  @Get(':id/report')
  async report(@AdminId() adminId: string, @Param('id') id: string, @Res() res: any) {
    const db = this.prisma.client;
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('기획전을 찾을 수 없습니다');

    const claims = await db.dropClaim.findMany({
      where: { drop: { campaignId: id } },
      orderBy: { claimedAt: 'asc' },
      include: {
        drop: { select: { title: true, dropPrice: true, normalPrice: true } },
        user: { select: { nickname: true } },
        order: { select: { orderNo: true, paidAmount: true, paidAt: true, vouchers: { select: { status: true, usedAt: true, code: true } } } },
      },
    });

    const rows = claims.map((c) => {
      const v = c.order?.vouchers?.[0];
      const status = v?.status === 'USED' ? '사용완료' : (CLAIM_STATUS_LABEL[c.status] ?? c.status);
      return {
        '판매시간': c.order?.paidAt ? fmtDate(c.order.paidAt) : fmtDate(c.claimedAt),
        '사용시간': v?.usedAt ? fmtDate(v.usedAt) : '',
        '주문번호': c.order?.orderNo ?? c.id.slice(0, 10).toUpperCase(),
        '주문 채널': '홀릭잼 앱',
        '상품명': c.drop.title,
        '구매자명': c.user.nickname,
        '정가 (KRW)': c.drop.normalPrice,
        '판매 단가 (KRW)': c.drop.dropPrice,
        '수량': c.qty,
        '총 금액 (KRW)': c.order?.paidAmount ?? c.drop.dropPrice * c.qty,
        '상태': status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '판매시간': '', '안내': '아직 판매 내역이 없습니다' }]);
    ws['!cols'] = [{ wch: 19 }, { wch: 19 }, { wch: 14 }, { wch: 10 }, { wch: 34 }, { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 6 }, { wch: 12 }, { wch: 9 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '판매실적');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fname = encodeURIComponent(`${campaign.title}_판매실적_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fname}`,
    });
    res.send(buf);
  }
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

@Controller('campaigns')
export class CampaignController {
  constructor(private prisma: PrismaService) {}

  /** 앱 홈 배너용 — 활성 + 기간 내 기획전 */
  @Get('active')
  async active() {
    const now = new Date();
    return this.prisma.client.campaign.findMany({
      where: {
        isActive: true,
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }],
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, title: true, subtitle: true, bannerImageUrl: true,
        subsidyLabel: true, endAt: true, i18n: true,
      },
    });
  }

  /** 기획전 상세 — 배너 + 소속 상품 목록 */
  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: any) {
    const lang = langOf(req);
    const now = new Date();
    const c = await this.prisma.client.campaign.findFirst({
      where: { id, isActive: true },
      include: {
        drops: {
          where: { status: { in: ['OPEN', 'SOLD_OUT'] }, closeAt: { gt: now } },
          orderBy: { closeAt: 'asc' },
          include: { merchant: { select: { name: true, i18n: true } } },
        },
      },
    });
    if (!c) throw new NotFoundException('진행 중인 기획전이 아닙니다');
    return {
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      bannerImageUrl: c.bannerImageUrl,
      subsidyLabel: c.subsidyLabel,
      endAt: c.endAt,
      i18n: (c as any).i18n,
      drops: c.drops.map((d) => ({
        id: d.id,
        title: d.title,
        imageUrl: d.imageUrl,
        normalPrice: d.normalPrice,
        dropPrice: d.dropPrice,
        discountRate: Math.round((1 - d.dropPrice / d.normalPrice) * 100),
        remainingQty: d.remainingQty,
        totalQty: d.totalQty,
        maxPerUser: d.maxPerUser,
        closeAt: d.closeAt,
        soldOut: d.status === 'SOLD_OUT' || d.remainingQty <= 0,
        merchantName: trField(d.merchant, 'name', lang),
        i18n: (d as any).i18n,
      })),
    };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminCampaignController, CampaignController],
  providers: [PrismaService],
})
export class CampaignModule {}
