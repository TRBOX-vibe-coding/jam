/**
 * 결제할 때 받는 정보 — 2026-09-29 사용자 결정: "결제 시 기본적으로 넣어야 하는 정보는 해야 됨".
 * 결제하는 사람의 이름·휴대폰 번호(필수)와 이메일(선택, 결제 영수증)을 받고, 필수 동의를 받는다.
 * 결제 수단은 카드와 간편 결제만 받는다 — 계좌이체·휴대폰 결제는 받지 않는다(9/29).
 *   → 토스를 붙일 때 결제창에서 카드·간편 결제만 연다 (orders.ts · drops.ts · membership.ts 결제 만드는 곳).
 */
import { BadRequestException } from '@nestjs/common';
import { normalizePhone, PHONE_REQUIRED } from './phone.util';

export type BuyerInput = { contactName?: string; contactPhone?: string; buyerEmail?: string; agreed?: boolean };
export type Buyer = { name: string; phone: string; email: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 이름·휴대폰·이메일·동의를 확인한다. 휴대폰은 안 넣었으면 전에 넣은 번호를 쓴다 */
export function checkBuyer(dto: BuyerInput, saved: { phone?: string | null }): Buyer {
  const name = (dto.contactName ?? '').trim();
  if (!name) throw new BadRequestException('결제하는 분 이름을 넣어 주세요');
  if (name.length > 20) throw new BadRequestException('이름은 20자까지 넣을 수 있어요');
  const phone = normalizePhone(dto.contactPhone) ?? normalizePhone(saved.phone);
  if (!phone) throw new BadRequestException(PHONE_REQUIRED);
  const email = (dto.buyerEmail ?? '').trim();
  if (email && !EMAIL_RE.test(email)) throw new BadRequestException('이메일 주소를 다시 확인해 주세요');
  if (dto.agreed !== true) throw new BadRequestException('필수 동의에 모두 체크해 주세요');
  return { name, phone, email: email || null };
}

/** 주문에 남기는 결제자 정보 */
export const buyerOrderData = (b: Buyer, now: Date) => ({
  buyerName: b.name, buyerPhone: b.phone, buyerEmail: b.email, agreedAt: now,
});
