import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { places } from '../data/places'
import { tickets } from '../data/tickets'

export function MyPage() {
  const { userName, membership, coupons, ownedTickets, logout, clearAll } = useApp()
  const activeCoupons = coupons.filter((c) => !c.used).length
  const activeTickets = ownedTickets.filter((t) => !t.used).length

  return (
    <div className="page">
      <header className="page-header">
        <h1>마이</h1>
        <p>멤버십 · 복지 · 제휴 신청</p>
      </header>

      <div className="profile-card">
        <p className="brand-mini">HOLIC GEM</p>
        <h2>{userName ? `${userName} 님` : '게스트'}</h2>
        {membership ? (
          <p>
            {membership.name} · ~{new Date(membership.expiresAt).toLocaleDateString('ko-KR')}
          </p>
        ) : (
          <p>멤버십을 시작하면 쿠폰·티켓 혜택을 쓸 수 있어요</p>
        )}
      </div>

      <div className="stat-row">
        <div className="stat">
          <strong>{places.length}</strong>
          <span>제휴처</span>
        </div>
        <div className="stat">
          <strong>{activeCoupons}</strong>
          <span>쿠폰</span>
        </div>
        <div className="stat">
          <strong>{activeTickets}</strong>
          <span>티켓</span>
        </div>
      </div>

      <div className="menu-list">
        {!userName ? (
          <Link to="/login">회원가입 / 로그인</Link>
        ) : (
          <button type="button" className="menu-btn" onClick={logout}>
            로그아웃
          </button>
        )}
        <Link to="/membership">멤버십 관리</Link>
        <Link to="/pay">Pay · 쿠폰함</Link>
        <Link to="/tickets">티켓 상품 ({tickets.length})</Link>
        <a href="https://litt.ly/holicgem" target="_blank" rel="noreferrer">
          향토기업 · 임직원 복지 신청
        </a>
        <a href="https://litt.ly/holicgem" target="_blank" rel="noreferrer">
          제휴처 입점 신청
        </a>
        <a href="mailto:holicgem@surfholic.co.kr">문의 holicgem@surfholic.co.kr</a>
        <a href="https://pf.kakao.com/" target="_blank" rel="noreferrer">
          카카오톡 &apos;홀릭잼&apos; 검색
        </a>
      </div>

      <p className="fine-print center">
        동백전 가맹점에서는 홀릭잼 할인 + 동백전 캐시백을 함께 받을 수 있어요.
      </p>

      <button type="button" className="btn btn-ghost full danger" onClick={clearAll}>
        체험 데이터 초기화
      </button>
    </div>
  )
}
