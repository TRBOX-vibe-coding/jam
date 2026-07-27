import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export function CouponsPage() {
  const { membership, coupons, useCoupon } = useApp()
  const active = coupons.filter((c) => !c.used)
  const used = coupons.filter((c) => c.used)

  return (
    <div className="page">
      <header className="page-header">
        <h1>내 쿠폰</h1>
        <p>매장에서 보여주면 혜택이 적용돼요</p>
      </header>

      {!membership && (
        <div className="empty-box">
          <p>아직 멤버십이 없어요.</p>
          <Link to="/membership" className="btn btn-primary">
            멤버십 보기
          </Link>
        </div>
      )}

      {membership && active.length === 0 && used.length === 0 && (
        <div className="empty-box">
          <p>받은 쿠폰이 아직 없어요.</p>
          <Link to="/places" className="btn btn-primary">
            장소에서 쿠폰 받기
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <section className="section">
          <h2 className="subhead">사용 가능 {active.length}</h2>
          <div className="coupon-list">
            {active.map((coupon) => (
              <article key={coupon.id} className="coupon-card">
                <div>
                  <p className="place-meta">
                    {coupon.category} · {coupon.area}
                  </p>
                  <h3>{coupon.placeName}</h3>
                  <p className="place-benefit">{coupon.benefit}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => useCoupon(coupon.id)}
                >
                  사용 완료
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {used.length > 0 && (
        <section className="section">
          <h2 className="subhead">사용 완료</h2>
          <div className="coupon-list">
            {used.map((coupon) => (
              <article key={coupon.id} className="coupon-card used">
                <div>
                  <h3>{coupon.placeName}</h3>
                  <p className="place-benefit">{coupon.benefit}</p>
                </div>
                <span className="used-label">사용됨</span>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
