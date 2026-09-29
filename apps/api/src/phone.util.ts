/**
 * 손님 휴대폰 번호 — 돈을 내고 사는 상품은 연락처를 받는다 (2026-09-29).
 * 가게가 예약 확인이나 날씨로 인한 취소 같은 일이 있을 때 전화하려고 쓴다.
 */
/** 숫자만 뽑아 010-1234-5678 모양으로. 휴대폰 번호가 아니면 null */
export function normalizePhone(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(d)) return null;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

export const PHONE_REQUIRED = '연락처(휴대폰 번호)를 넣어 주세요. 예약 확인이나 이용 안내가 필요할 때 가게가 이 번호로 연락합니다.';
