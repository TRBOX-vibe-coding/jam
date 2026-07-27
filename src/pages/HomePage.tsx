import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { courses } from '../data/courses'
import { places } from '../data/places'

export function HomePage() {
  const { membership, userName } = useApp()
  const featured = places.filter((p) => p.area !== '다낭·호이안').slice(0, 4)
  const vietnam = places.filter((p) => p.area === '다낭·호이안')

  return (
    <div className="page home-page">
      <header className="top-bar">
        <div>
          <p className="brand-mark">HOLIC GEM</p>
          <h1 className="sr-only">홀릭잼</h1>
        </div>
        <Link to="/membership" className="top-chip">
          {membership ? membership.name : '멤버십'}
        </Link>
      </header>

      <section className="hero">
        <div className="hero-bg" aria-hidden />
        <div className="hero-content">
          <p className="brand">홀릭잼</p>
          <h2>부산형 라이프스타일 플랫폼</h2>
          <p className="hero-sub">
            서핑 · 로컬 F&B · 관광 어트랙션 할인까지, 여행의 모든 것
          </p>
          <div className="hero-cta">
            <Link to="/membership" className="btn btn-primary">
              {membership ? '내 멤버십' : '멤버십 구매하기'}
            </Link>
            <Link to="/explore" className="btn btn-ghost">
              제휴처 둘러보기
            </Link>
          </div>
        </div>
      </section>

      {!userName && (
        <Link to="/login" className="banner-link login-banner">
          회원가입하고 환영 쿠폰 받기 →
        </Link>
      )}

      <section className="banner-stack">
        <Link to="/tickets" className="promo-banner cyan">
          <strong>키마위크 해양레저 티켓</strong>
          <span>서핑 · 요트 · SUP · 윈드서핑 단독 판매</span>
        </Link>
        <Link to="/tickets/t6" className="promo-banner night">
          <strong>밀락수변 바다영화관</strong>
          <span>광안리 밤바다 · 홀릭잼 티켓 예매 OPEN</span>
        </Link>
        <Link to="/explore?area=다낭·호이안" className="promo-banner sand">
          <strong>다낭·호이안 기획전</strong>
          <span>현지 쿠폰 무료 · 가이드맵 제공</span>
        </Link>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>홀릭잼과 함께라면</h2>
        </div>
        <div className="benefit-grid">
          <div>
            <strong>맛집 40+</strong>
            <span>최대 20% 할인</span>
          </div>
          <div>
            <strong>관광 15+</strong>
            <span>최대 50% 할인</span>
          </div>
          <div>
            <strong>호텔</strong>
            <span>객실 10~15%</span>
          </div>
          <div>
            <strong>서핑</strong>
            <span>강습/렌탈 10%</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>추천 코스</h2>
          <Link to="/explore">전체 보기</Link>
        </div>
        <div className="course-scroll">
          {courses.map((c) => (
            <article key={c.id} className="course-card">
              <img src={c.image} alt="" />
              <div>
                <p className="place-meta">{c.days}</p>
                <h3>{c.title}</h3>
                <p>{c.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>부산 핫플</h2>
          <Link to="/explore">더보기</Link>
        </div>
        <div className="place-list">
          {featured.map((place) => (
            <Link key={place.id} to={`/explore/${place.id}`} className="place-card">
              <div className="place-card-media">
                <img src={place.image} alt={place.name} loading="lazy" />
                <span className="place-discount">{place.discount}</span>
              </div>
              <div className="place-card-body">
                <p className="place-meta">
                  {place.category} · {place.area}
                </p>
                <h3>{place.name}</h3>
                <p className="place-benefit">{place.benefit}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>다낭·호이안</h2>
          <Link to="/explore?area=다낭·호이안">기획전</Link>
        </div>
        <div className="place-list">
          {vietnam.map((place) => (
            <Link key={place.id} to={`/explore/${place.id}`} className="place-card">
              <div className="place-card-media">
                <img src={place.image} alt={place.name} loading="lazy" />
                <span className="place-discount">{place.discount}</span>
              </div>
              <div className="place-card-body">
                <p className="place-meta">{place.category}</p>
                <h3>{place.name}</h3>
                <p className="place-benefit">{place.benefit}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section how-section">
        <h2>홀릭잼, 어떻게 쓰나요?</h2>
        <ol className="how-list">
          <li>
            <strong>앱 가입</strong>
            <span>회원가입하면 환영 쿠폰이 지급돼요</span>
          </li>
          <li>
            <strong>멤버십 구매</strong>
            <span>3일잼 · 5일잼 · 잼마스터 중 선택</span>
          </li>
          <li>
            <strong>쿠폰 다운로드</strong>
            <span>지역 탭에서 핫플 쿠폰을 받아요</span>
          </li>
          <li>
            <strong>매장·현장에서 제시</strong>
            <span>Pay &gt; 쿠폰에서 보여주고 혜택 적용</span>
          </li>
        </ol>
      </section>
    </div>
  )
}
