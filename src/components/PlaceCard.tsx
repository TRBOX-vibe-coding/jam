import { Link } from 'react-router-dom'
import type { Place } from '../data/places'

export function PlaceCard({ place }: { place: Place }) {
  return (
    <Link to={`/places/${place.id}`} className="place-card">
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
  )
}
