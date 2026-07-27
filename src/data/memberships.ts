export type MembershipPlan = {
  id: string
  name: string
  days: number
  price: number
  originalPrice?: number
  badge?: string
  summary: string
  perks: string[]
}

export const memberships: MembershipPlan[] = [
  {
    id: '3day',
    name: '3일잼',
    days: 3,
    price: 4900,
    summary: '3박4일권 · 짧은 부산 여행',
    perks: [
      '제휴 쿠폰 무제한 다운로드',
      '동반인 함께 사용 가능',
      '서핑 멤버스 온리 티켓 활성화',
      'F&B·관광·해양레저 혜택',
    ],
  },
  {
    id: '5day',
    name: '5일잼',
    days: 5,
    price: 8900,
    badge: '인기',
    summary: '5박6일권 · 여유로운 나들이',
    perks: [
      '제휴 쿠폰 무제한 다운로드',
      '동반인 함께 사용 가능',
      '서핑 멤버스 온리 티켓 활성화',
      '추천 코스·기획전 이용',
    ],
  },
  {
    id: 'master',
    name: '잼마스터',
    days: 365,
    price: 30000,
    originalPrice: 50000,
    badge: '추천',
    summary: '1년권 · 연간 VIP 멤버십',
    perks: [
      '제휴처 최대 50% 할인',
      '쿠폰 무제한 · 동반인 사용',
      '해양레저·호텔 특별가',
      '신규 제휴처 우선 오픈',
      '임직원 복지·제휴 혜택',
    ],
  },
]
