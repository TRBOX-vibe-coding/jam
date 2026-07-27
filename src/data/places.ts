export type Category = '전체' | '맛집' | '카페' | '관광' | '해양레저'

export type Place = {
  id: string
  name: string
  category: Exclude<Category, '전체'>
  area: string
  benefit: string
  discount: string
  description: string
  image: string
  tags: string[]
}

export const categories: Category[] = ['전체', '맛집', '카페', '관광', '해양레저']

export const places: Place[] = [
  {
    id: '1',
    name: '광안리 파도밥상',
    category: '맛집',
    area: '광안리',
    benefit: '전 메뉴 20% 할인',
    discount: '20%',
    description: '광안대교가 보이는 해변 한식. 회덮밥과 된장찌개로 유명한 로컬 맛집입니다.',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
    tags: ['한식', '오션뷰', '데이트'],
  },
  {
    id: '2',
    name: '해운대 블루웨이브 카페',
    category: '카페',
    area: '해운대',
    benefit: '음료 1잔 무료 (멤버십)',
    discount: 'FREE',
    description: '해운대 해변 바로 앞 시그니처 라떼와 디저트. 일출·석양 명소로 인기입니다.',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
    tags: ['카페', '디저트', '뷰맛집'],
  },
  {
    id: '3',
    name: '송도 해상케이블카',
    category: '관광',
    area: '송도',
    benefit: '왕복권 25% 할인',
    discount: '25%',
    description: '송도 바다 위를 가로지르는 케이블카. 야경이 특히 아름답습니다.',
    image:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=900&q=80',
    tags: ['관광', '야경', '가족'],
  },
  {
    id: '4',
    name: '서프홀릭 송정',
    category: '해양레저',
    area: '송정',
    benefit: '서핑 강습 30% 할인',
    discount: '30%',
    description: '초보부터 가능한 서핑 강습. 장비 대여 포함, 당일 예약도 가능합니다.',
    image:
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=900&q=80',
    tags: ['서핑', '체험', '액티비티'],
  },
  {
    id: '5',
    name: '남포동 불티나 밀면',
    category: '맛집',
    area: '남포동',
    benefit: '2인 이상 10% 할인',
    discount: '10%',
    description: '부산 밀면의 오랜 로컬 식당. 시원하고 담백한 국물이 특징입니다.',
    image:
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80',
    tags: ['밀면', '로컬', '가성비'],
  },
  {
    id: '6',
    name: '영도 브릭커피',
    category: '카페',
    area: '영도',
    benefit: '디저트 세트 15% 할인',
    discount: '15%',
    description: '영도 언덕 위 벽돌 카페. 부산항 전망과 스페셜티 커피를 즐길 수 있습니다.',
    image:
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=900&q=80',
    tags: ['스페셜티', '감성', '포토존'],
  },
  {
    id: '7',
    name: '부산 아쿠아리움',
    category: '관광',
    area: '해운대',
    benefit: '입장권 35% 할인',
    discount: '35%',
    description: '해운대 해변 아래 대형 수족관. 아이·가족 여행객에게 특히 추천합니다.',
    image:
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=900&q=80',
    tags: ['가족', '실내', '인기'],
  },
  {
    id: '8',
    name: '광안 요트투어',
    category: '해양레저',
    area: '광안리',
    benefit: '요트 체험 20% 할인',
    discount: '20%',
    description: '광안대교 야경을 가까이서 보는 요트 투어. 커플·단체 모두 인기입니다.',
    image:
      'https://images.unsplash.com/photo-1540946485063-a40da27545f8?auto=format&fit=crop&w=900&q=80',
    tags: ['요트', '야경', '데이트'],
  },
  {
    id: '9',
    name: '기장 해녀의 집',
    category: '맛집',
    area: '기장',
    benefit: '해산물 세트 15% 할인',
    discount: '15%',
    description: '기장 바닷가 해산물 식당. 성게비빔밥과 물회가 시그니처입니다.',
    image:
      'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80',
    tags: ['해산물', '물회', '로컬'],
  },
  {
    id: '10',
    name: '흰여울문화마을 전망대',
    category: '관광',
    area: '영도',
    benefit: '전망 카페 음료 무료',
    discount: 'FREE',
    description: '영도 절벽 마을 산책과 바다 전망. 인생샷 스팟으로 유명합니다.',
    image:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80',
    tags: ['산책', '포토', '힐링'],
  },
]

export function getPlace(id: string) {
  return places.find((p) => p.id === id)
}
