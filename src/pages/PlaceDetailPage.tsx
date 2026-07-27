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
        <Link to="/places" className="btn btn-primary">
          목록으로
        </Link>
      </div>
    )
  }

  const handleDownload = () => {
    if (!membership) {
      navigate('/membership')
      return
    }
    const result = downloadCoupon(place.id)
    setToast(result.message)
    window.setTimeout(() => setToast(null), 2200)
  }

  return (
    <div className="page detail-page">
      <div className="detail-hero">
        <img src={place.image} alt={place.name} />
        <Link to="/places" className="back-btn" aria-label="뒤로">
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

        <div className="tag-row">
          {place.tags.map((tag) => (
            <span key={tag} className="tag">
              #{tag}
            </span>
          ))}
        </div>

        <div className="detail-note">
          <strong>이용 방법</strong>
          <p>쿠폰 받기 → 매장 방문 → 직원에게 쿠폰 제시</p>
        </div>
      </div>

      <div className="sticky-cta">
        <button type="button" className="btn btn-primary full" onClick={handleDownload}>
          {membership ? '쿠폰 받기' : '멤버십 구매 후 쿠폰 받기'}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
