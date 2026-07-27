import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getTicket } from '../data/tickets'

function formatPrice(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

export function TicketDetailPage() {
  const { id = '' } = useParams()
  const ticket = getTicket(id)
  const { membership, buyTicket } = useApp()
  const navigate = useNavigate()
  const [toast, setToast] = useState<string | null>(null)

  if (!ticket) {
    return (
      <div className="page">
        <p className="empty-text">티켓을 찾을 수 없어요.</p>
        <Link to="/tickets" className="btn btn-primary">
          목록으로
        </Link>
      </div>
    )
  }

  const handleBuy = () => {
    if (ticket.membersOnly && !membership) {
      navigate('/membership')
      return
    }
    const result = buyTicket(ticket.id)
    setToast(result.message)
    window.setTimeout(() => setToast(null), 2600)
  }

  return (
    <div className="page detail-page">
      <div className="detail-hero">
        <img src={ticket.image} alt={ticket.name} />
        <Link to="/tickets" className="back-btn">
          ←
        </Link>
      </div>
      <div className="detail-body">
        <p className="place-meta">
          {ticket.type} · {ticket.place}
        </p>
        <h1>{ticket.name}</h1>
        <p className="detail-benefit">{ticket.benefit}</p>
        <div className="plan-price" style={{ marginBottom: 12 }}>
          {ticket.originalPrice && (
            <span className="old-price">{formatPrice(ticket.originalPrice)}</span>
          )}
          <strong style={{ fontSize: '1.4rem' }}>{formatPrice(ticket.price)}</strong>
        </div>
        <p className="detail-desc">{ticket.description}</p>
        <div className="detail-note">
          <strong>구매 후 이용 4STEP</strong>
          <p>
            1) 티켓 구매 2) {ticket.phone}로 예약 3) “홀릭잼에서 티켓 결제했어요” 4) 현장
            제시
          </p>
        </div>
      </div>
      <div className="sticky-cta">
        <button type="button" className="btn btn-primary full" onClick={handleBuy}>
          {ticket.membersOnly && !membership ? '멤버십 구매 후 이용' : '티켓 구매하기'}
        </button>
      </div>
      {toast && (
        <div className="toast success">
          {toast} <Link to="/pay">Pay 가기</Link>
        </div>
      )}
    </div>
  )
}
