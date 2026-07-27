export type Ticket = {
  id: string
  name: string
  type: '서핑' | '요트' | 'SUP' | '윈드서핑' | '이벤트'
  place: string
  phone: string
  price: number
  originalPrice?: number
  benefit: string
  description: string
  image: string
  membersOnly?: boolean
}

export const tickets: Ticket[] = [
  {
    id: 't1',
    name: '서프홀릭 강습 체험',
    type: '서핑',
    place: '서프홀릭 송정',
    phone: '051-701-4851',
    price: 6500,
    originalPrice: 7200,
    benefit: '멤버십 회원 10% 할인가',
    description:
      '장비 대여 포함 서핑 강습. 구매 후 지점에 전화 예약 → 현장에서 티켓 제시.',
    image:
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=900&q=80',
    membersOnly: true,
  },
  {
    id: 't2',
    name: '서핑 렌탈 2시간',
    type: '서핑',
    place: '서프홀릭 전국지점',
    phone: '051-701-4851',
    price: 18000,
    originalPrice: 20000,
    benefit: '렌탈 10% 할인',
    description: '보드·슈트 렌탈. 예약 후 현장에서 티켓 사용 처리.',
    image:
      'https://images.unsplash.com/photo-1455729552865-3658a5d98402?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 't3',
    name: '광안대교 요트 투어',
    type: '요트',
    place: '광안 요트투어',
    phone: '051-701-4851',
    price: 32000,
    originalPrice: 40000,
    benefit: '요트 체험 20% 할인',
    description: '광안 야경 요트. 구매 → 전화 예약 → 현장 제시.',
    image:
      'https://images.unsplash.com/photo-1540946485063-a40da27545f8?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 't4',
    name: 'SUP 체험 1회',
    type: 'SUP',
    place: '송정 해양레저',
    phone: '051-701-4851',
    price: 25000,
    originalPrice: 30000,
    benefit: 'SUP 체험 특가',
    description: '패들보드 체험. 초보 가능, 전화로 시간 확정.',
    image:
      'https://images.unsplash.com/photo-1530541930197-ff16d911e8e4?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 't5',
    name: '윈드서핑 입문',
    type: '윈드서핑',
    place: '송정 해양레저',
    phone: '051-701-4851',
    price: 45000,
    originalPrice: 55000,
    benefit: '입문 강습 포함',
    description: '윈드서핑 입문 강습. 앱 티켓 구매 후 예약.',
    image:
      'https://images.unsplash.com/photo-1473496169904-658ba7c3555e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 't6',
    name: '밀락수변 바다영화관',
    type: '이벤트',
    place: '광안리 밀락수변공원',
    phone: '카카오 홀릭잼',
    price: 15000,
    benefit: '홀릭잼 단독 예매',
    description: '광안리 밤바다 영화. 홀릭잼에서만 티켓 예매.',
    image:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80',
  },
]

export function getTicket(id: string) {
  return tickets.find((t) => t.id === id)
}
