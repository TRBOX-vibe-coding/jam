/**
 * 업로드 이미지 서빙 + 실시간 리사이즈.
 * GET /uploads/<name>?w=320  → 요청 폭에 맞춰 WebP로 변환해 내려준다.
 * 변환 결과는 디스크(.cache)에 저장해 두 번째 요청부터는 즉시 응답.
 * 화면 UI 크기별로 알맞은 용량을 내려 보내 페이지 속도를 지킨다.
 */
import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { UPLOAD_CACHE_DIR, UPLOAD_DIR } from './uploads';

const ALLOWED_WIDTHS = [96, 160, 320, 480, 640, 960, 1280];
const CACHE_HEADER = 'public, max-age=31536000, immutable'; // 파일명이 유니크하므로 영구 캐시 가능

function pickWidth(raw?: string): number | null {
  const w = Number(raw);
  if (!w || Number.isNaN(w)) return null;
  // 요청 폭 이상인 가장 가까운 허용 폭으로 스냅 (캐시 파편화 방지)
  return ALLOWED_WIDTHS.find((a) => a >= w) ?? ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

@Controller('uploads')
export class UploadsController {
  @Get(':name')
  async serve(@Param('name') name: string, @Query('w') w: string | undefined, @Res() res: Response) {
    // 경로 탈출 차단: 파일명 화이트리스트
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes('..')) throw new NotFoundException();
    const original = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(original)) throw new NotFoundException();

    const width = pickWidth(w);
    if (!width) {
      // 원본 그대로 (그래도 장기 캐시)
      res.setHeader('Cache-Control', CACHE_HEADER);
      return res.sendFile(original);
    }

    const cacheName = `${name}.w${width}.webp`;
    const cached = path.join(UPLOAD_CACHE_DIR, cacheName);
    if (!fs.existsSync(cached)) {
      try {
        await sharp(original)
          .rotate() // EXIF 회전 보정
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(cached);
      } catch {
        res.setHeader('Cache-Control', CACHE_HEADER);
        return res.sendFile(original); // 변환 실패 시 원본 폴백
      }
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', CACHE_HEADER);
    return res.sendFile(cached);
  }
}
