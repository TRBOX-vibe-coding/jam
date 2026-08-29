/**
 * 인증.
 *  - 사용자: 소셜 간편가입만 존재한다(카카오/네이버/구글/애플). 비밀번호 없음.
 *    개발 모드에서는 provider+providerId만 보내면 가입/로그인이 된다.
 *    실서비스 전환 시 이 자리에서 각 소셜의 토큰 검증만 추가하면 된다.
 *  - 관리자: 이메일+비밀번호. 앱 사용자와 토큰 타입을 분리한다.
 */
import {
  Body, CanActivate, Controller, ExecutionContext, Injectable,
  Module, Post, UnauthorizedException, createParamDecorator,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { SocialProvider } from '@holicgem/db';
import { PrismaService } from './prisma.service';

// ----------------------------- 토큰 페이로드 --------------------------------

export type UserToken = { sub: string; typ: 'user' };
export type AdminToken = { sub: string; typ: 'admin'; role: string };

// ----------------------------- 가드 ----------------------------------------

function extractBearer(ctx: ExecutionContext): string | null {
  const req = ctx.switchToHttp().getRequest();
  const h: string | undefined = req.headers['authorization'];
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}

@Injectable()
export class UserGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const token = extractBearer(ctx);
    if (!token) throw new UnauthorizedException('로그인이 필요합니다');
    try {
      const payload = this.jwt.verify<UserToken>(token);
      if (payload.typ !== 'user') throw new Error();
      ctx.switchToHttp().getRequest().userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다');
    }
  }
}

/** 로그인 없이도 접근 가능하지만, 토큰이 있으면 userId를 실어준다. */
@Injectable()
export class OptionalUserGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const token = extractBearer(ctx);
    if (token) {
      try {
        const payload = this.jwt.verify<UserToken>(token);
        if (payload.typ === 'user') ctx.switchToHttp().getRequest().userId = payload.sub;
      } catch {
        /* 무시: 비로그인으로 취급 */
      }
    }
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const token = extractBearer(ctx);
    if (!token) throw new UnauthorizedException('관리자 로그인이 필요합니다');
    try {
      const payload = this.jwt.verify<AdminToken>(token);
      if (payload.typ !== 'admin') throw new Error();
      const req = ctx.switchToHttp().getRequest();
      req.adminId = payload.sub;
      req.adminRole = payload.role;
      return true;
    } catch {
      throw new UnauthorizedException('유효하지 않은 관리자 토큰입니다');
    }
  }
}

export const UserId = createParamDecorator(
  (_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().userId as string | undefined,
);
export const AdminId = createParamDecorator(
  (_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().adminId as string,
);

// ----------------------------- DTO -----------------------------------------

class SocialLoginDto {
  @IsEnum(SocialProvider) provider!: SocialProvider;
  /** 개발 모드: 소셜에서 받은 고유 ID를 그대로 넣는다. 실서비스: accessToken으로 대체. */
  @IsString() providerId!: string;
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() email?: string;
}

class AdminLoginDto {
  @IsString() email!: string;
  @IsString() @MinLength(4) password!: string;
}

class ForgotDto {
  @IsString() email!: string;
}
class ResetDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

/**
 * Resend로 이메일 발송. RESEND_API_KEY가 없으면(키 미발급 상태) 발송을 건너뛰고
 * 서버 콘솔에 링크를 찍어 개발·시연 중에도 흐름을 확인할 수 있게 한다.
 */
async function sendResetEmail(to: string, resetUrl: string): Promise<'sent' | 'console'> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[auth] RESEND_API_KEY 없음 — 비밀번호 재설정 링크(콘솔 출력): ${to} → ${resetUrl}`);
    return 'console';
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'HOLIC GEM <onboarding@resend.dev>',
      to: [to],
      subject: '[홀릭잼] 관리자 비밀번호 재설정',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0E4F8B">HOLIC GEM 비밀번호 재설정</h2>
        <p>아래 버튼을 눌러 새 비밀번호를 설정하세요. 링크는 30분간 유효합니다.</p>
        <p style="margin:24px 0"><a href="${resetUrl}" style="background:#0E4F8B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">비밀번호 재설정</a></p>
        <p style="color:#888;font-size:12px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
      </div>`,
    }),
  });
  if (!res.ok) {
    console.error('[auth] Resend 발송 실패:', res.status, await res.text().catch(() => ''));
    console.log(`[auth] 재설정 링크(콘솔 출력): ${to} → ${resetUrl}`);
    return 'console';
  }
  return 'sent';
}

// ----------------------------- 컨트롤러 -------------------------------------

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Post('social')
  async social(@Body() dto: SocialLoginDto) {
    const db = this.prisma.client;
    let user = await db.user.findUnique({
      where: { provider_providerId: { provider: dto.provider, providerId: dto.providerId } },
    });
    const isNew = !user;
    if (!user) {
      user = await db.user.create({
        data: {
          provider: dto.provider,
          providerId: dto.providerId,
          nickname: dto.nickname ?? `홀릭${dto.providerId.slice(-4)}`,
          email: dto.email,
        },
      });
    }
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const ownedMerchant = await db.merchant.findFirst({
      where: { ownerUserId: user.id },
      select: { id: true, name: true, status: true },
    });

    const token = this.jwt.sign({ sub: user.id, typ: 'user' } satisfies UserToken);
    return { token, isNew, user: { id: user.id, nickname: user.nickname, provider: user.provider }, ownedMerchant };
  }

  @Post('admin/login')
  async adminLogin(@Body() dto: AdminLoginDto) {
    const admin = await this.prisma.client.adminUser.findUnique({ where: { email: dto.email } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('계정을 찾을 수 없습니다');
    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('비밀번호가 올바르지 않습니다');

    await this.prisma.client.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    // 데모 기간 로그인 유지 30일. 실서비스 전환 시 짧은 만료 + 리프레시로 교체.
    const token = this.jwt.sign(
      { sub: admin.id, typ: 'admin', role: admin.role } satisfies AdminToken,
      { expiresIn: '30d' },
    );
    return { token, admin: { id: admin.id, name: admin.name, role: admin.role } };
  }

  /**
   * 관리자 비밀번호 찾기 — 이메일로 재설정 링크 발송 (Resend).
   * 계정 존재 여부를 노출하지 않기 위해 항상 같은 응답을 준다.
   */
  @Post('admin/forgot')
  async adminForgot(@Body() dto: ForgotDto) {
    const db = this.prisma.client;
    const admin = await db.adminUser.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (admin && admin.isActive) {
      const token = randomBytes(24).toString('hex');
      await db.adminPasswordReset.create({
        data: { adminId: admin.id, token, expiresAt: new Date(Date.now() + 30 * 60_000) },
      });
      const base = process.env.ADMIN_BASE_URL || 'https://holicgem-admin.vercel.app';
      await sendResetEmail(admin.email, `${base}/reset?token=${token}`);
    }
    return { ok: true, message: '가입된 이메일이라면 재설정 링크를 보냈습니다. 메일함을 확인하세요.' };
  }

  /** 재설정 링크의 토큰으로 새 비밀번호 설정 */
  @Post('admin/reset')
  async adminReset(@Body() dto: ResetDto) {
    const db = this.prisma.client;
    const rec = await db.adminPasswordReset.findUnique({ where: { token: dto.token } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      throw new UnauthorizedException('링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await db.$transaction([
      db.adminUser.update({ where: { id: rec.adminId }, data: { passwordHash } }),
      db.adminPasswordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true, message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.' };
  }
}

// ----------------------------- 모듈 -----------------------------------------

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'holicgem-dev-secret',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [PrismaService, UserGuard, OptionalUserGuard, AdminGuard],
  exports: [UserGuard, OptionalUserGuard, AdminGuard],
})
export class AuthModule {}
