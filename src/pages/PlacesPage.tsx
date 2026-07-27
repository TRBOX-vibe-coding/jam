import { useMemo, useState } from 'react'
import { PlaceCard } from '../components/PlaceCard'
import { categories, places, type Category } from '../data/places'

export function PlacesPage() {
  const [category, setCategory] = useState<Category>('전체')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    return places.filter((place) => {
      const matchCategory = category === '전체' || place.category === category
      const q = query.trim()
      const matchQuery =
        !q ||
        place.name.includes(q) ||
        place.area.includes(q) ||
        place.tags.some((t) => t.includes(q))
      return matchCategory && matchQuery
    })
  }, [category, query])

  return (
    <div className="page">
      <header className="page-header">
        <h1>탐험</h1>
        <p>부산 제휴 장소를 둘러보세요</p>
      </header>

      <div className="search-box">
        <input
          type="search"
          placeholder="장소, 지역, 키워드 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="장소 검색"
        />
      </div>

      <div className="chip-row" role="tablist" aria-label="카테고리">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={`chip${category === c ? ' active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="result-count">{filtered.length}곳</p>

      <div className="place-list">
        {filtered.map((place) => (
          <PlaceCard key={place.id} place={place} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="empty-text">조건에 맞는 장소가 없어요.</p>
      )}
    </div>
  )
}
