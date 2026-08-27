import { randomBytes, randomInt } from 'node:crypto';

/** 주문번호: HG + yyMMdd + 6자리 난수. CS에서 부르기 쉬운 형태. */
export function makeOrderNo(): string {
  const d = new Date();
  const ymd = [
    String(d.getFullYear()).slice(2),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  return `HG${ymd}${String(randomInt(0, 999999)).padStart(6, '0')}`;
}

/** 이용권 코드: 사람이 읽어줄 수 있는 4-4-4 형태 */
export function makeVoucherCode(): string {
  const raw = randomBytes(6).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** 사용완료 화면 검증 토큰: 직원이 읽기 쉬운 6자리 */
export function makeVerifyToken(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 혼동 문자(I,L,O,0,1) 제외
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86400_000);
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
