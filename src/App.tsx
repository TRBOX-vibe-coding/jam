import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { CouponsPage } from './pages/CouponsPage'
import { HomePage } from './pages/HomePage'
import { MembershipPage } from './pages/MembershipPage'
import { MyPage } from './pages/MyPage'
import { PlaceDetailPage } from './pages/PlaceDetailPage'
import { PlacesPage } from './pages/PlacesPage'

export default function App() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/places" element={<PlacesPage />} />
          <Route path="/places/:id" element={<PlaceDetailPage />} />
          <Route path="/membership" element={<MembershipPage />} />
          <Route path="/coupons" element={<CouponsPage />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
