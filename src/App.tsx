import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { ExplorePage } from './pages/ExplorePage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MembershipPage } from './pages/MembershipPage'
import { MyPage } from './pages/MyPage'
import { PayPage } from './pages/PayPage'
import { PlaceDetailPage } from './pages/PlaceDetailPage'
import { TicketDetailPage } from './pages/TicketDetailPage'
import { TicketsPage } from './pages/TicketsPage'

export default function App() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/explore/:id" element={<PlaceDetailPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/pay" element={<PayPage />} />
          <Route path="/membership" element={<MembershipPage />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/places" element={<Navigate to="/explore" replace />} />
          <Route path="/coupons" element={<Navigate to="/pay" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
