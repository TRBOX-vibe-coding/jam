export type Course = {
  id: string
  title: string
  days: string
  summary: string
  spots: string[]
  image: string
}

export const courses: Course[] = [
  {
    id: 'c1',
    title: '부산 3박4일 알뜰 코스',
    days: '3일잼 추천',
    summary: '멤버십 하나로 맛집·관광·서핑까지 본전 뽑기',
    spots: ['광안 맛집', '송도케이블카', '서프홀릭 송정', '해운대 카페'],
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'c2',
    title: 'BIFF · 광안·해운대 코스',
    days: '영화제·도심',
    summary: '수영·센텀·광안·해운대 제휴처를 한 번에',
    spots: ['광안 탭 브랜드', '해운대 탭 브랜드', '바다영화관'],
    image:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'c3',
    title: '다낭·호이안 핫플 가이드',
    days: '해외 기획전',
    summary: '현지 쿠폰·가이드맵으로 바로 쓰기',
    spots: ['콩카페', '반미', '호이안 스파'],
    image:
      'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=900&q=80',
  },
]
