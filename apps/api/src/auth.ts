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
    const token = this.jwt.sign(
      { sub: admin.id, typ: 'admin', role: admin.role } satisfies AdminToken,
      { expiresIn: '12h' },
    );
    return { token, admin: { id: admin.id, name: admin.name, role: admin.role } };
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
