/**
 * 관리자 셋팅 확장 — "앱에 보이는 모든 것을 관리자에서 직접 셋팅"을 완성한다.
 *  1) DROP 직접 등록 (승인 없이 즉시 오픈 — 본사 발굴 딜)
 *  2) 멤버십 플랜 관리 (3일잼·5일잼·잼마스터·맛보기잼 가격/기간)
 *  3) 지역·카테고리 관리
 *  4) 콘텐츠 번역(i18n) 조회/편집 — 대표 요구 5번 "관리자에서 번역값 입력/수정"
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsISO8601, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from './prisma.service';
import { AdminGuard, AdminId, AuthModule } from './auth';
import { saveImageDataUrl } from './uploads';

// ── DTO ──

class AdminCreateDropDto {
  @IsString() merchantId!: string;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  /** DEAL=현장 결제 딜(무료 받기), TICKET=앱에서 결제 */
  @IsOptional() @IsString() kind?: 'DEAL' | 'TICKET';
  @Type(() => Number) @IsInt() @Min(0) normalPrice!: number;
  @Type(() => Number) @IsInt() @Min(0) dropPrice!: number;
  @Type(() => Number) @IsInt() @Min(1) totalQty!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPerUser?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) personsPerUnit?: number;
  @IsISO8601() closeAt!: string;
  @IsOptional() @IsBoolean() memberOnly?: boolean;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() imageBase64?: string;
}

class CreatePlanDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsInt() @Min(0) price!: number;
  @Type(() => Number) @IsInt() @Min(1) durationDays!: number;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

class PatchPlanDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateRegionDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

class PatchRegionDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsBoolean() isOpen?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

class CreateCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

class PatchCategoryDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

class PatchI18nDto {
  @IsObject() i18n!: Record<string, Record<string, string>>;
}

/** 번역 대상 엔티티 정의 — 어떤 필드를 번역하는지 */
const I18N_ENTITIES: Record<string, { model: string; fields: string[]; label: string }> = {
  drops: { model: 'drop', fields: ['title', 'description'], label: 'title' },
  products: { model: 'product', fields: ['name', 'description', 'cancelPolicy'], label: 'name' },
  benefits: { model: 'benefit', fields: ['title', 'freebieName', 'conditions'], label: 'title' },
  merchants: { model: 'merchant', fields: ['name', 'intro', 'address'], label: 'name' },
  campaigns: { model: 'campaign', fields: ['title', 'subtitle', 'subsidyLabel'], label: 'title' },
  plans: { model: 'membershipPlan', fields: ['name', 'description'], label: 'name' },
  regions: { model: 'region', fields: ['name'], label: 'name' },
  categories: { model: 'category', fields: ['name'], label: 'name' },
};

const slug = (prefix: string) => `${prefix}_${Date.now().toString(36)}`;

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminSettingsController {
  constructor(private prisma: PrismaService) {}

  private audit(adminId: string, action: string, targetType: string, targetId: string, memo?: string) {
    return this.prisma.client.auditLog.create({
      data: { adminUserId: adminId, action, targetType, targetId, memo },
    });
  }

  // ── 1) DROP 직접 등록 (본사 발굴 딜 — 즉시 오픈) ──

  @Post('drops')
  async createDrop(@AdminId() adminId: string, @Body() dto: AdminCreateDropDto) {
    const db = this.prisma.client;
    const merchant = await db.merchant.findFirst({ where: { id: dto.merchantId, status: 'ACTIVE' } });
    if (!merchant) throw new BadRequestException('운영 중인 가맹점을 선택해 주세요');
    if (dto.dropPrice > dto.normalPrice) throw new BadRequestException('딜 가격이 정상가보다 클 수 없습니다');
    const closeAt = new Date(dto.closeAt);
    if (closeAt <= new Date()) throw new BadRequestException('마감 시각이 이미 지났습니다');

    const kind = dto.kind === 'TICKET' ? 'TICKET' : 'DEAL';
    const imageUrl = dto.imageBase64 ? saveImageDataUrl(dto.imageBase64, 'drop') : dto.imageUrl ?? null;

    return this.prisma.client.$transaction(async (tx) => {
      // TICKET은 이용권 발급을 위해 사용처리용 상품이 필요하다 (기획전과 같은 방식)
      let productId: string | null = null;
      if (kind === 'TICKET') {
        const product = await tx.product.create({
          data: {
            merchantId: merchant.id,
            categoryId: merchant.categoryId,
            type: 'TICKET',
            name: dto.title,
            description: dto.description,
            imageUrl,
            basePrice: dto.normalPrice,
            approval: 'ACTIVE',
            isActive: false,
          },
        });
        productId = product.id;
      }
      const drop = await tx.drop.create({
        data: {
          merchantId: merchant.id,
          regionId: merchant.regionId,
          categoryId: merchant.categoryId,
          productId,
          kind,
          status: 'OPEN',
          audience: dto.memberOnly ? 'MEMBER_ONLY' : 'ALL',
          title: dto.title,
          description: dto.description,
          imageUrl,
          normalPrice: dto.normalPrice,
          dropPrice: dto.dropPrice,
          totalQty: dto.totalQty,
          remainingQty: dto.totalQty,
          maxPerUser: dto.maxPerUser ?? 1,
          personsPerUnit: dto.personsPerUnit ?? 1,
          openAt: new Date(),
          closeAt,
        },
      });
      await this.audit(adminId, 'DROP_CREATE', 'Drop', drop.id, `${dto.title} · ${kind} · 총 ${dto.totalQty}개`);
      return drop;
    });
  }

  // ── 2) 멤버십 플랜 ──

  @Get('plans')
  async plans() {
    return this.prisma.client.membershipPlan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { memberships: true } } },
    });
  }

  @Post('plans')
  async createPlan(@AdminId() adminId: string, @Body() dto: CreatePlanDto) {
    const exists = await this.prisma.client.membershipPlan.findUnique({ where: { code: dto.code.toUpperCase() } });
    if (exists) throw new BadRequestException('이미 같은 코드의 플랜이 있습니다');
    const p = await this.prisma.client.membershipPlan.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description,
        price: dto.price,
        durationDays: dto.durationDays,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit(adminId, 'PLAN_CREATE', 'MembershipPlan', p.id, `${dto.name} · ${dto.price}원 · ${dto.durationDays}일`);
    return p;
  }

  @Patch('plans/:id')
  async patchPlan(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchPlanDto) {
    const p = await this.prisma.client.membershipPlan.update({ where: { id }, data: { ...dto } });
    await this.audit(adminId, 'PLAN_UPDATE', 'MembershipPlan', id, JSON.stringify(dto).slice(0, 180));
    return p;
  }

  // ── 3) 지역·카테고리 ──

  @Get('regions')
  async regions() {
    return this.prisma.client.region.findMany({
      orderBy: [{ country: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { merchants: true, drops: true } } },
    });
  }

  @Post('regions')
  async createRegion(@AdminId() adminId: string, @Body() dto: CreateRegionDto) {
    const r = await this.prisma.client.region.create({
      data: {
        code: slug('rg'),
        name: dto.name,
        city: dto.city ?? '부산광역시',
        district: dto.name,
        country: dto.country ?? '대한민국',
        isOpen: true,
        sortOrder: dto.sortOrder ?? 99,
      },
    });
    await this.audit(adminId, 'REGION_CREATE', 'Region', r.id, dto.name);
    return r;
  }

  @Patch('regions/:id')
  async patchRegion(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchRegionDto) {
    const r = await this.prisma.client.region.update({ where: { id }, data: { ...dto } });
    await this.audit(adminId, 'REGION_UPDATE', 'Region', id, JSON.stringify(dto).slice(0, 120));
    return r;
  }

  @Get('categories')
  async categories() {
    return this.prisma.client.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { merchants: true } } },
    });
  }

  @Post('categories')
  async createCategory(@AdminId() adminId: string, @Body() dto: CreateCategoryDto) {
    const c = await this.prisma.client.category.create({
      data: {
        code: slug('ct'),
        name: dto.name,
        emoji: dto.emoji,
        isActive: true,
        sortOrder: dto.sortOrder ?? 99,
      },
    });
    await this.audit(adminId, 'CATEGORY_CREATE', 'Category', c.id, dto.name);
    return c;
  }

  @Patch('categories/:id')
  async patchCategory(@AdminId() adminId: string, @Param('id') id: string, @Body() dto: PatchCategoryDto) {
    const c = await this.prisma.client.category.update({ where: { id }, data: { ...dto } });
    await this.audit(adminId, 'CATEGORY_UPDATE', 'Category', id, JSON.stringify(dto).slice(0, 120));
    return c;
  }

  // ── 4) 콘텐츠 번역 ──

  @Get('i18n/:entity')
  async i18nList(@Param('entity') entity: string) {
    const def = I18N_ENTITIES[entity];
    if (!def) throw new NotFoundException('알 수 없는 번역 대상입니다');
    const select: Record<string, boolean> = { id: true, i18n: true, createdAt: true };
    for (const f of def.fields) select[f] = true;
    const rows = await (this.prisma.client as any)[def.model].findMany({
      select,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { fields: def.fields, labelField: def.label, rows };
  }

  @Patch('i18n/:entity/:id')
  async i18nUpdate(
    @AdminId() adminId: string,
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() dto: PatchI18nDto,
  ) {
    const def = I18N_ENTITIES[entity];
    if (!def) throw new NotFoundException('알 수 없는 번역 대상입니다');
    // en/zh/ja 외 키와 정의되지 않은 필드는 버린다
    const clean: Record<string, Record<string, string>> = {};
    for (const lang of ['en', 'zh', 'ja']) {
      const src = dto.i18n?.[lang];
      if (!src || typeof src !== 'object') continue;
      const out: Record<string, string> = {};
      for (const f of def.fields) {
        const v = (src as any)[f];
        if (typeof v === 'string' && v.trim() !== '') out[f] = v.trim();
      }
      if (Object.keys(out).length > 0) clean[lang] = out;
    }
    const row = await (this.prisma.client as any)[def.model].update({
      where: { id },
      data: { i18n: Object.keys(clean).length > 0 ? clean : null },
    });
    await this.audit(adminId, 'I18N_UPDATE', def.model, id);
    return row;
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminSettingsController],
  providers: [PrismaService],
})
export class AdminSettingsModule {}
