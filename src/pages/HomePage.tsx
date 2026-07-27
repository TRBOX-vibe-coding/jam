import { Link } from 'react-router-dom'
import { PlaceCard } from '../components/PlaceCard'
import { useApp } from '../context/AppContext'
import { places } from '../data/places'

export function HomePage() {
  const { membership } = useApp()
  const featured = places.slice(0, 4)

  return (
    <div className="page home-page">
      <section className="hero">
        <div className="hero-bg" aria-hidden />
        <div className="hero-content">
          <p className="brand">JAM</p>
          <h1>부산이 더 재미있어지는 멤버십</h1>
          <p className="hero-sub">
            맛집·카페·관광·해양레저 혜택을 한곳에서. 쿠폰 받고 매장에서 바로 쓰세요.
          </p>
          <div className="hero-cta">
            <Link to="/membership" className="btn btn-primary">
              {membership ? '멤버십 보기' : '멤버십 시작하기'}
            </Link>
            <Link to="/places" className="btn btn-ghost">
              장소 둘러보기
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>오늘 추천</h2>
          <Link to="/places">전체 보기</Link>
        </div>
        <div className="place-list">
          {featured.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      </section>

      <section className="section how-section">
        <h2>이렇게 써요</h2>
        <ol className="how-list">
          <li>
            <strong>멤버십 구매</strong>
            <span>여행 기간에 맞는 이용권을 고르세요</span>
          </li>
          <li>
            <strong>쿠폰 받기</strong>
            <span>가고 싶은 곳의 혜택을 다운로드</span>
          </li>
          <li>
            <strong>매장에서 제시</strong>
            <span>쿠폰만 보여주면 할인이 적용돼요</span>
          </li>
        </ol>
      </section>
    </div>
  )
}
