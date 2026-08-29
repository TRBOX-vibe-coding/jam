/**
 * 점주 업로드 이미지 저장.
 * PG처럼 스토리지(S3/R2)도 아직 결정 전이라, 그때까지 API 서버 디스크에 보관한다.
 * 경로는 한글/OneDrive 이슈를 피해 ASCII 고정 경로(%LOCALAPPDATA%)를 쓴다.
 * 클라이언트는 data URL(base64)로 보내고, 여기서 파일로 풀어 /uploads/<name>으로 서빙한다.
 */
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const UPLOAD_DIR = path.join(
  process.env.LOCALAPPDATA || os.homedir(),
  'holicgem-uploads',
);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** data URL을 파일로 저장하고 공개 경로(/uploads/..)를 돌려준다. */
export function saveImageDataUrl(dataUrl: string, prefix: string): string {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new BadRequestException('이미지 형식은 JPG/PNG/WebP만 가능합니다');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw new BadRequestException('이미지가 비어 있습니다');
  if (buf.length > MAX_BYTES) throw new BadRequestException('이미지는 5MB 이하여야 합니다');
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[m[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
