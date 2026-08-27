import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export function PayPage() {
  const { membership, coupons, ownedTickets, useCoupon, useTicket } = useApp()
  const [tab, setTab] = useState<'coupon' | 'ticket'>('coupon')
  const activeCoupons = coupons.filter((c) => !c.used)
  const usedCoupons = coupons.filter((c) => c.used)
  const activeTickets = ownedTickets.filter((t) => !t.used)
  const usedTickets = ownedTickets.filter((t) => t.used)

  return (
    <div className="page">
      <header className="page-header">
        <h1>Pay</h1>
        <p>쿠폰 · 구매 티켓을 여기서 보여주고 사용해요</p>
      </header>

      {membership && (
        <div className="status-banner">
          <strong>{membership.name} 이용 중</strong>
          <span>~ {new Date(membership.expiresAt).toLocaleDateString('ko-KR')}</span>
        </div>
      )}

      <div className="pay-tabs">
        <button
          type="button"
          className={tab === 'coupon' ? 'active' : ''}
          onClick={() => setTab('coupon')}
        >
          쿠폰 {activeCoupons.length}
        </button>
        <button
          type="button"
          className={tab === 'ticket' ? 'active' : ''}
          onClick={() => setTab('ticket')}
        >
          티켓 {activeTickets.length}
        </button>
      </div>

      {tab === 'coupon' && (
        <>
          {activeCoupons.length === 0 && usedCoupons.length === 0 && (
            <div className="empty-box">
              <p>받은 쿠폰이 없어요.</p>
              <Link to="/explore" className="btn btn-primary">
                탐험에서 쿠폰 받기
              </Link>
            </div>
          )}
          {activeCoupons.length > 0 && (
            <div className="coupon-list">
              {activeCoupons.map((coupon) => (
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
          )}
          {usedCoupons.length > 0 && (
            <section className="section">
              <h2 className="subhead">사용 완료</h2>
              <div className="coupon-list">
                {usedCoupons.map((coupon) => (
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
        </>
      )}

      {tab === 'ticket' && (
        <>
          {activeTickets.length === 0 && usedTickets.length === 0 && (
            <div className="empty-box">
              <p>구매한 티켓이 없어요.</p>
              <Link to="/tickets" className="btn btn-primary">
                티켓 보러가기
              </Link>
            </div>
          )}
          {activeTickets.map((ticket) => (
            <article key={ticket.id} className="coupon-card ticket-owned">
              <div>
                <p className="place-meta">{ticket.place}</p>
                <h3>{ticket.name}</h3>
                <p className="place-benefit">{ticket.benefit}</p>
                <p className="phone-line">예약: {ticket.phone}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => useTicket(ticket.id)}
              >
                사용 처리
              </button>
            </article>
          ))}
          {usedTickets.map((ticket) => (
            <article key={ticket.id} className="coupon-card used">
              <div>
                <h3>{ticket.name}</h3>
                <p className="place-benefit">{ticket.benefit}</p>
              </div>
              <span className="used-label">사용됨</span>
            </article>
          ))}
        </>
      )}
    </div>
  )
}
