import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getPlace } from '../data/places'

export function PlaceDetailPage() {
  const { id = '' } = useParams()
  const place = getPlace(id)
  const { membership, downloadCoupon } = useApp()
  const navigate = useNavigate()
  const [toast, setToast] = useState<string | null>(null)

  if (!place) {
    return (
      <div className="page">
        <p className="empty-text">장소를 찾을 수 없어요.</p>
        <Link to="/explore" className="btn btn-primary">
          목록으로
        </Link>
      </div>
    )
  }

  const canFree = place.freeWithoutMembership
  const locked = !canFree && !membership

  const handleDownload = () => {
    if (locked) {
      navigate('/membership')
      return
    }
    const result = downloadCoupon(place.id)
    setToast(result.message)
    window.setTimeout(() => setToast(null), 2400)
  }

  return (
    <div className="page detail-page">
      <div className="detail-hero">
        <img src={place.image} alt={place.name} />
        <Link to="/explore" className="back-btn" aria-label="뒤로">
          ←
        </Link>
        <span className="place-discount detail-discount">{place.discount}</span>
      </div>

      <div className="detail-body">
        <p className="place-meta">
          {place.category} · {place.area}
        </p>
        <h1>{place.name}</h1>
        <p className="detail-benefit">{place.benefit}</p>
        <p className="detail-desc">{place.description}</p>
        {canFree && (
          <p className="free-badge">기획전 · 멤버십 없이 쿠폰 이용 가능</p>
        )}
        <div className="tag-row">
          {place.tags.map((tag) => (
            <span key={tag} className="tag">
              #{tag}
            </span>
          ))}
        </div>
        <div className="detail-note">
          <strong>이용 방법</strong>
          <p>쿠폰 다운로드 → 매장 방문 → Pay &gt; 쿠폰 제시 → 현장 할인</p>
        </div>
      </div>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary full" onClick={handleDownload}>
          {locked ? '멤버십 구매 후 쿠폰 받기' : '할인권 다운로드'}
        </button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
