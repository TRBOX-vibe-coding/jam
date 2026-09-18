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

/** 마지막 사용일을 사람이 읽는 날짜로 */
export function untilText(endAt: string | Date, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  return lastUsableDay(endAt).toLocaleDateString(locale, opts);
}
