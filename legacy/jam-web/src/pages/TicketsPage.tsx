import { Link } from 'react-router-dom'
import { tickets } from '../data/tickets'

function formatPrice(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

export function TicketsPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>티켓</h1>
        <p>앱에서 구매 → 전화 예약 → 현장에서 제시</p>
      </header>

      <div className="ticket-list">
        {tickets.map((ticket) => (
          <Link key={ticket.id} to={`/tickets/${ticket.id}`} className="ticket-card">
            <img src={ticket.image} alt="" />
            <div>
              <p className="place-meta">
                {ticket.type}
                {ticket.membersOnly ? ' · 멤버스 온리' : ''}
              </p>
              <h3>{ticket.name}</h3>
              <p className="place-benefit">{ticket.benefit}</p>
              <div className="plan-price">
                {ticket.originalPrice && (
                  <span className="old-price">{formatPrice(ticket.originalPrice)}</span>
                )}
                <strong>{formatPrice(ticket.price)}</strong>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
