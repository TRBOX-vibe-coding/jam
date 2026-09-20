/**
 * 딜(DROP) 상태를 사장님이 읽는 말로 바꾼다.
 *
 * 마감 시각이 지나면 status가 OPEN이어도 '마감'으로 보여준다. 손님 앱은 마감된
 * 딜을 이미 걸러내는데 점주 화면만 DB의 상태 글자를 그대로 보여줘서, 2주 전에
 * 끝난 딜이 '진행 중'으로 남아 있고 '진행 중 DROP 4개' 숫자까지 틀렸다(2026-09-20).
 */
export type DropLike = {
  status: string;
  openAt?: string | Date | null;
  closeAt?: string | Date | null;
};

const at = (v?: string | Date | null) => (v ? new Date(v).getTime() : NaN);

/** 지금 손님에게 실제로 열려 있는 딜인가 — 개수를 셀 때 쓴다 */
export function isLiveDrop(d: DropLike, now = Date.now()): boolean {
  if (d.status !== 'OPEN') return false;
  const close = at(d.closeAt);
  if (!Number.isNaN(close) && close <= now) return false;
  const open = at(d.openAt);
  if (!Number.isNaN(open) && open > now) return false;
  return true;
}

/** 화면에 찍을 상태 글자 */
export function dropStateLabel(d: DropLike, now = Date.now()): string {
  switch (d.status) {
    case 'DRAFT': return '작성 중';
    case 'PENDING': return '승인 대기';
    case 'REJECTED': return '반려됨';
    case 'CANCELLED': return '취소됨';
    case 'CLOSED': return '마감';
  }
  const close = at(d.closeAt);
  if (!Number.isNaN(close) && close <= now) return '마감';
  if (d.status === 'SOLD_OUT') return '품절';
  const open = at(d.openAt);
  if (!Number.isNaN(open) && open > now) return '오픈 예정';
  return '진행 중';
}

/** 진행 중인 것을 위로, 그다음 마감이 임박한 순서 */
export function liveFirst(a: DropLike, b: DropLike): number {
  const d = (isLiveDrop(b) ? 1 : 0) - (isLiveDrop(a) ? 1 : 0);
  if (d !== 0) return d;
  return (at(a.closeAt) || 0) - (at(b.closeAt) || 0);
}
