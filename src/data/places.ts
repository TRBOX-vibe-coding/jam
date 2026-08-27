export type Area =
  | '전체'
  | '광안'
  | '해운대'
  | '송정'
  | '남포'
  | '영도'
  | '기장'
  | '다낭·호이안'

export type Category = '전체' | 'F&B' | '관광' | '해양레저' | '호텔'

export type Place = {
  id: string
  name: string
  category: Exclude<Category, '전체'>
  area: Exclude<Area, '전체'>
  benefit: string
  discount: string
  description: string
  image: string
  tags: string[]
  freeWithoutMembership?: boolean
}

export const areas: Area[] = [
  '전체',
  '광안',
  '해운대',
  '송정',
  '남포',
  '영도',
  '기장',
  '다낭·호이안',
]

export const categories: Category[] = ['전체', 'F&B', '관광', '해양레저', '호텔']

export const places: Place[] = [
  {
    id: 'p1',
    name: '까사부사노',
    category: 'F&B',
    area: '광안',
    benefit: '전 메뉴 10% 할인',
    discount: '10%',
    description: '광안리 오션뷰 이탈리안. 홀릭잼 멤버십 제시 시 현장 할인.',
    image:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
    tags: ['이탈리안', '오션뷰', '데이트'],
  },
  {
    id: 'p2',
    name: '해운대 블루웨이브 카페',
    category: 'F&B',
    area: '해운대',
    benefit: '음료 1잔 무료',
    discount: 'FREE',
    description: '해운대 해변 앞 시그니처 라떼·디저트. 멤버십 기간 내 무료 음료 혜택.',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
    tags: ['카페', '디저트', '뷰맛집'],
  },
  {
    id: 'p3',
    name: '송도해상케이블카',
    category: '관광',
    area: '남포',
    benefit: '왕복권 25% 할인',
    discount: '25%',
    description: '송도 바다 위 케이블카. 쿠폰 다운로드 후 현장에서 제시하세요.',
    image:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=900&q=80',
    tags: ['관광', '야경', '가족'],
  },
  {
    id: 'p4',
    name: '부산아쿠아리움',
    category: '관광',
    area: '해운대',
    benefit: '입장권 35% 할인',
    discount: '35%',
    description: '해운대 해변 아래 대형 수족관. 가족·아이 여행객 추천.',
    image:
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=900&q=80',
    tags: ['가족', '실내', '인기'],
  },
  {
    id: 'p5',
    name: '서프홀릭 송정',
    category: '해양레저',
    area: '송정',
    benefit: '서핑 강습/렌탈 10% 할인',
    discount: '10%',
    description: '전국 서핑 프랜차이즈 서프홀릭. 멤버십·티켓으로 현장 이용.',
    image:
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=900&q=80',
    tags: ['서핑', '강습', '렌탈'],
  },
  {
    id: 'p6',
    name: '남포동 불티나 밀면',
    category: 'F&B',
    area: '남포',
    benefit: '2인 이상 10% 할인',
    discount: '10%',
    description: '부산 로컬 밀면. 시원하고 담백한 국물이 시그니처.',
    image:
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80',
    tags: ['밀면', '로컬', '가성비'],
  },
  {
    id: 'p7',
    name: '영도 브릭커피',
    category: 'F&B',
    area: '영도',
    benefit: '디저트 세트 15% 할인',
    discount: '15%',
    description: '영도 언덕 벽돌 카페. 부산항 전망과 스페셜티 커피.',
    image:
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=900&q=80',
    tags: ['스페셜티', '포토존'],
  },
  {
    id: 'p8',
    name: '광안 요트투어',
    category: '해양레저',
    area: '광안',
    benefit: '요트 체험 20% 할인',
    discount: '20%',
    description: '광안대교 야경 요트. 티켓 구매 후 전화 예약 → 현장 제시.',
    image:
      'https://images.unsplash.com/photo-1540946485063-a40da27545f8?auto=format&fit=crop&w=900&q=80',
    tags: ['요트', '야경', '데이트'],
  },
  {
    id: 'p9',
    name: '기장 해녀의 집',
    category: 'F&B',
    area: '기장',
    benefit: '해산물 세트 15% 할인',
    discount: '15%',
    description: '기장 바닷가 해산물. 성게비빔밥·물회 추천.',
    image:
      'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80',
    tags: ['해산물', '물회'],
  },
  {
    id: 'p10',
    name: '흰여울문화마을',
    category: '관광',
    area: '영도',
    benefit: '전망 카페 음료 무료',
    discount: 'FREE',
    description: '영도 절벽 마을 산책·인생샷 스팟.',
    image:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80',
    tags: ['산책', '포토'],
  },
  {
    id: 'p11',
    name: '해운대 씨사이드호텔',
    category: '호텔',
    area: '해운대',
    benefit: '객실 10~15% 할인',
    discount: '15%',
    description: '해운대 해변 인근 호텔. 멤버십 제시 시 객실별 할인.',
    image:
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    tags: ['숙소', '오션뷰'],
  },
  {
    id: 'p12',
    name: '밀락수변 바다영화관',
    category: '관광',
    area: '광안',
    benefit: '티켓 단독 예매·할인',
    discount: '특가',
    description: '광안리 밤바다 영화 관람. 홀릭잼 단독 티켓 예매.',
    image:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80',
    tags: ['야경', '이벤트'],
  },
  {
    id: 'p13',
    name: '콩카페 다낭',
    category: 'F&B',
    area: '다낭·호이안',
    benefit: '음료 최대 25% 할인',
    discount: '25%',
    description: '다낭 현지 핫플. 기획전 기간 멤버십 없이 쿠폰 이용 가능.',
    image:
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80',
    tags: ['베트남', '카페'],
    freeWithoutMembership: true,
  },
  {
    id: 'p14',
    name: '호이안 올드타운 스파',
    category: '관광',
    area: '다낭·호이안',
    benefit: '스파 20% 할인',
    discount: '20%',
    description: '호이안 현지 스파. 다낭·호이안 기획전 무료 쿠폰 대상.',
    image:
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80',
    tags: ['스파', '호이안'],
    freeWithoutMembership: true,
  },
  {
    id: 'p15',
    name: '다낭 반미 하우스',
    category: 'F&B',
    area: '다낭·호이안',
    benefit: '세트 15% 할인',
    discount: '15%',
    description: '다낭 로컬 반미. 기획전 기간 무제한 쿠폰.',
    image:
      'https://images.unsplash.com/photo-1509722747041-616f39b92496?auto=format&fit=crop&w=900&q=80',
    tags: ['반미', '로컬'],
    freeWithoutMembership: true,
  },
]

export function getPlace(id: string) {
  return places.find((p) => p.id === id)
}
