/**
 * 날짜 표기 도우미.
 *
 * 멤버십·쿠폰의 endAt은 '끝나는 시각'이라 대개 그 날 00시다.
 * 9/30에 시작한 3일잼의 endAt은 10/4 00시 — 실제로 쓸 수 있는 마지막 날은 10/3이다.
 * 그대로 "10월 4일까지"라고 적으면 하루를 더 쓸 수 있다고 읽힌다. 손님이 손해 보거나
 * 매장에서 실랑이가 난다. 표기는 언제나 '마지막으로 쓸 수 있는 날'로 한다.
 */

/** 끝나는 시각 → 마지막으로 쓸 수 있는 날 (0시에 끝나면 전날) */
export function lastUsableDay(endAt: string | Date): Date {
  const d = new Date(endAt);
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const ymdhm = (d: Date) =>
  `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

/**
 * 잼 기간 한 줄 — "2026.09.30 00:00 ~ 2026.10.03 23:59" (2026-09-19 문서 4-3·3-4, 대표 확정).
 * 결제 화면 · 결제 끝난 화면 · 잼 화면 · MY 네 곳이 모두 이 모양을 쓴다.
 * endAt은 '끝나는 시각'(대개 다음 날 0시)이라 1분을 빼서 마지막으로 쓸 수 있는 시각을 보여준다.
 */
export function jamPeriodText(startAt: string | Date, endAt: string | Date): string {
  return `${ymdhm(new Date(startAt))} ~ ${ymdhm(new Date(new Date(endAt).getTime() - 60_000))}`;
}

/** 잼 길이 이름 — 3일잼은 '3박 4일 여행용', 1년짜리는 '1년' */
export function jamSpanText(
  durationDays: number,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  if (durationDays <= 30) return t('jamSpanTrip', { n: durationDays, m: durationDays + 1 });
  if (durationDays === 365 || durationDays === 366) return t('jamSpanYear');
  return t('jamDays', { n: durationDays });
}

/** 마지막 사용일을 사람이 읽는 날짜로 */
export function untilText(endAt: string | Date, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  return lastUsableDay(endAt).toLocaleDateString(locale, opts);
}
