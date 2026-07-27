import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { places } from '../data/places'

export function MyPage() {
  const { membership, coupons, clearAll } = useApp()
  const activeCoupons = coupons.filter((c) => !c.used).length

  return (
    <div className="page">
      <header className="page-header">
        <h1>마이</h1>
        <p>내 멤버십과 이용 현황</p>
      </header>

      <div className="profile-card">
        <p className="brand-mini">JAM</p>
        <h2>{membership ? membership.name + ' 회원' : '게스트'}</h2>
        {membership ? (
          <p>~ {new Date(membership.expiresAt).toLocaleDateString('ko-KR')}까지</p>
        ) : (
          <p>멤버십을 시작하면 쿠폰을 받을 수 있어요</p>
        )}
      </div>

      <div className="stat-row">
        <div className="stat">
          <strong>{places.length}</strong>
          <span>제휴처</span>
        </div>
        <div className="stat">
          <strong>{activeCoupons}</strong>
          <span>보유 쿠폰</span>
        </div>
        <div className="stat">
          <strong>{membership ? 'ON' : 'OFF'}</strong>
          <span>멤버십</span>
        </div>
      </div>

      <div className="menu-list">
        <Link to="/membership">멤버십 관리</Link>
        <Link to="/coupons">내 쿠폰함</Link>
        <Link to="/places">제휴 장소</Link>
      </div>

      <button type="button" className="btn btn-ghost full danger" onClick={clearAll}>
        체험 데이터 초기화
      </button>
    </div>
  )
}
