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
    summary: '짧은 부산 여행에 딱',
    perks: ['제휴처 쿠폰 무제한', '동반인 함께 사용', '3일간 모든 혜택'],
  },
  {
    id: '5day',
    name: '5일잼',
    days: 5,
    price: 8900,
    badge: '인기',
    summary: '여유로운 부산 나들이',
    perks: ['제휴처 쿠폰 무제한', '동반인 함께 사용', '5일간 모든 혜택', '추천 코스 제공'],
  },
  {
    id: 'master',
    name: '잼마스터',
    days: 365,
    price: 30000,
    originalPrice: 50000,
    badge: '추천',
    summary: '1년 내내 부산 혜택',
    perks: [
      '제휴처 쿠폰 무제한',
      '동반인 함께 사용',
      '최대 50% 할인',
      '해양레저 특별가',
      '신규 제휴처 우선 오픈',
    ],
  },
]
