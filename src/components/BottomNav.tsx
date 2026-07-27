import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: '홈', icon: '⌂' },
  { to: '/places', label: '탐험', icon: '◎' },
  { to: '/membership', label: '멤버십', icon: '◆' },
  { to: '/coupons', label: '쿠폰', icon: '◇' },
  { to: '/my', label: '마이', icon: '☺' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon" aria-hidden>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
