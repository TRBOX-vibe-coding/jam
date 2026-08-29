import 'reflect-metadata';
import { loadEnv } from './env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOAD_DIR } from './uploads';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  // 점주가 올린 상품 사진. 별도 스토리지(S3 등) 결정 전까지 API 서버 디스크에 둔다.
  app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/', maxAge: '7d' });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`[api] HOLIC GEM API on http://localhost:${port}`);
}

bootstrap();
