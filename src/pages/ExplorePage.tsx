import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlaceCard } from '../components/PlaceCard'
import {
  areas,
  categories,
  places,
  type Area,
  type Category,
} from '../data/places'

export function ExplorePage() {
  const [params] = useSearchParams()
  const initialArea = (params.get('area') as Area) || '전체'
  const [area, setArea] = useState<Area>(
    areas.includes(initialArea) ? initialArea : '전체',
  )
  const [category, setCategory] = useState<Category>('전체')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    return places.filter((place) => {
      const matchArea = area === '전체' || place.area === area
      const matchCategory = category === '전체' || place.category === category
      const q = query.trim()
      const matchQuery =
        !q ||
        place.name.includes(q) ||
        place.area.includes(q) ||
        place.tags.some((t) => t.includes(q))
      return matchArea && matchCategory && matchQuery
    })
  }, [area, category, query])

  return (
    <div className="page">
      <header className="page-header">
        <h1>탐험</h1>
        <p>지역 탭에서 제휴 브랜드를 찾아보세요</p>
      </header>

      <div className="search-box">
        <input
          type="search"
          placeholder="브랜드, 지역, 키워드"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="chip-row" role="tablist" aria-label="지역">
        {areas.map((a) => (
          <button
            key={a}
            type="button"
            className={`chip${area === a ? ' active' : ''}`}
            onClick={() => setArea(a)}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="chip-row thin" role="tablist" aria-label="카테고리">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ghost${category === c ? ' active' : ''}`}
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
      {filtered.length === 0 && <p className="empty-text">조건에 맞는 곳이 없어요.</p>}
    </div>
  )
}
