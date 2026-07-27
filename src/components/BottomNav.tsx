import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: '홈', icon: '⌂' },
  { to: '/explore', label: '탐험', icon: '◎' },
  { to: '/tickets', label: '티켓', icon: '🎟' },
  { to: '/pay', label: 'Pay', icon: '◇' },
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
