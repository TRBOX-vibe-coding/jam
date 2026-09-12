/**
 * 내 쿠폰 — 결제 상품에 묶여 받은 쿠폰만 모은다 (2026-09-12 대표 확정).
 *
 * 하단 탭 '할인 쿠폰'은 부산 전체를 둘러보는 곳이고, 여기는 내가 받아서 실제로 쓰는 곳이다.
 * 무료 회원은 전체 목록에서 [사용하기]가 잠기지만, 여기 있는 쿠폰은 결제로 받았으니 그대로 쓴다.
 * 화면을 갈라두면 뱃지로 구분할 필요 없이 헷갈릴 일이 없다.
 */
import { CouponsScreen } from '../lib/coupons';

export default function MyCouponsScreen() {
  return <CouponsScreen source="PRODUCT" />;
}
