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

async function exists(file: string): Promise<boolean> {
  try {
    await fs.promises.access(file);
    return true;
  } catch {
    return false;
  }
}

/** 지금 만드는 중인 변환본 — 같은 이미지·폭을 여러 명이 동시에 처음 요청해도 변환은 한 번만 한다 */
const converting = new Map<string, Promise<void>>();

/**
 * 변환본을 만든다. 임시 파일에 다 쓴 뒤 이름을 바꿔서, 쓰는 중인 파일이 손님에게 나가지 않는다.
 * (바로 최종 이름에 쓰면 동시에 들어온 요청이 덜 쓴 파일을 읽다가 연결이 끊긴다)
 * 실패해도 던지지 않는다 — 호출한 쪽이 변환본이 생겼는지 보고 원본으로 대신한다.
 */
function convert(original: string, cached: string, width: number): Promise<void> {
  let job = converting.get(cached);
  if (!job) {
    const tmp = `${cached}.${process.pid}.${Date.now()}.tmp`;
    job = sharp(original)
      .rotate() // EXIF 회전 보정
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(tmp)
      .then(() => fs.promises.rename(tmp, cached))
      .catch(() => fs.promises.rm(tmp, { force: true }).catch(() => undefined))
      .then(() => undefined)
      .finally(() => converting.delete(cached));
    converting.set(cached, job);
  }
  return job;
}

function send(res: Response, file: string) {
  res.sendFile(file, (err) => {
    // 손님이 도중에 끊은 경우(이미 응답을 보낸 뒤)는 무시한다
    if (err && !res.headersSent) res.status(404).end();
  });
}

@Controller('uploads')
export class UploadsController {
  @Get(':name')
  async serve(@Param('name') name: string, @Query('w') w: string | undefined, @Res() res: Response) {
    // 경로 탈출 차단: 파일명 화이트리스트
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes('..')) throw new NotFoundException();
    const original = path.join(UPLOAD_DIR, name);
    if (!(await exists(original))) throw new NotFoundException();

    res.setHeader('Cache-Control', CACHE_HEADER);
    const width = pickWidth(w);
    if (!width) return send(res, original); // 원본 그대로 (그래도 장기 캐시)

    const cached = path.join(UPLOAD_CACHE_DIR, `${name}.w${width}.webp`);
    if (!(await exists(cached))) {
      await convert(original, cached, width);
      if (!(await exists(cached))) return send(res, original); // 변환 실패 시 원본 폴백
    }
    res.setHeader('Content-Type', 'image/webp');
    return send(res, cached);
  }
}
