import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { memberships } from '../data/memberships'

function formatPrice(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

export function MembershipPage() {
  const { membership, purchaseMembership } = useApp()
  const [selected, setSelected] = useState('5day')
  const [done, setDone] = useState(false)

  const handleBuy = () => {
    purchaseMembership(selected)
    setDone(true)
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>멤버십</h1>
        <p>기간만 고르면 모든 제휴 혜택이 열려요</p>
      </header>

      {membership && (
        <div className="status-banner">
          <strong>{membership.name} 이용 중</strong>
          <span>
            ~ {new Date(membership.expiresAt).toLocaleDateString('ko-KR')}까지
          </span>
        </div>
      )}

      <div className="plan-list">
        {memberships.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={`plan-card${selected === plan.id ? ' selected' : ''}`}
            onClick={() => setSelected(plan.id)}
          >
            <div className="plan-top">
              <div>
                <h2>{plan.name}</h2>
                <p>{plan.summary}</p>
              </div>
              {plan.badge && <span className="plan-badge">{plan.badge}</span>}
            </div>
            <div className="plan-price">
              {plan.originalPrice && (
                <span className="old-price">{formatPrice(plan.originalPrice)}</span>
              )}
              <strong>{formatPrice(plan.price)}</strong>
            </div>
            <ul>
              {plan.perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <button type="button" className="btn btn-primary full" onClick={handleBuy}>
        {membership ? '이용권 변경하기' : '지금 구매하기'}
      </button>

      <p className="fine-print">
        * 데모용 화면입니다. 실제 결제는 되지 않으며, 선택 즉시 체험 멤버십이 활성화됩니다.
      </p>

      {done && (
        <div className="toast success">
          멤버십이 활성화됐어요!{' '}
          <Link to="/places">장소 보러가기</Link>
        </div>
      )}
    </div>
  )
}
