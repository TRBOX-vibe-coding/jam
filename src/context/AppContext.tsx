import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { memberships, type MembershipPlan } from '../data/memberships'
import { getPlace } from '../data/places'
import { getTicket } from '../data/tickets'

export type ActiveMembership = {
  planId: string
  name: string
  expiresAt: string
}

export type Coupon = {
  id: string
  placeId: string
  placeName: string
  benefit: string
  area: string
  category: string
  downloadedAt: string
  used: boolean
  kind: 'place'
}

export type OwnedTicket = {
  id: string
  ticketId: string
  name: string
  place: string
  phone: string
  benefit: string
  purchasedAt: string
  used: boolean
  kind: 'ticket'
}

type AppContextValue = {
  userName: string | null
  membership: ActiveMembership | null
  coupons: Coupon[]
  ownedTickets: OwnedTicket[]
  login: (name: string) => void
  logout: () => void
  purchaseMembership: (planId: string) => void
  downloadCoupon: (placeId: string) => { ok: boolean; message: string }
  useCoupon: (couponId: string) => void
  buyTicket: (ticketId: string) => { ok: boolean; message: string }
  useTicket: (ownedId: string) => void
  clearAll: () => void
}

const STORAGE_KEY = 'holicgem-v2'

type Stored = {
  userName: string | null
  membership: ActiveMembership | null
  coupons: Coupon[]
  ownedTickets: OwnedTicket[]
}

const AppContext = createContext<AppContextValue | null>(null)

function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { userName: null, membership: null, coupons: [], ownedTickets: [] }
    return JSON.parse(raw) as Stored
  } catch {
    return { userName: null, membership: null, coupons: [], ownedTickets: [] }
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [userName, setUserName] = useState<string | null>(null)
  const [membership, setMembership] = useState<ActiveMembership | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [ownedTickets, setOwnedTickets] = useState<OwnedTicket[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = loadStored()
    setUserName(stored.userName)
    if (stored.membership) {
      const expired = new Date(stored.membership.expiresAt).getTime() < Date.now()
      if (expired) {
        setMembership(null)
        setCoupons([])
        setOwnedTickets(stored.ownedTickets)
      } else {
        setMembership(stored.membership)
        setCoupons(stored.coupons)
        setOwnedTickets(stored.ownedTickets)
      }
    } else {
      setCoupons(stored.coupons)
      setOwnedTickets(stored.ownedTickets)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userName, membership, coupons, ownedTickets } satisfies Stored),
    )
  }, [userName, membership, coupons, ownedTickets, ready])

  const value = useMemo<AppContextValue>(
    () => ({
      userName,
      membership,
      coupons,
      ownedTickets,
      login: (name: string) => {
        setUserName(name.trim() || '홀릭잼 회원')
        // 가입 혜택 쿠폰 (실제 앱: 회원가입만 해도 쿠폰 지급)
        setCoupons((prev) => {
          if (prev.some((c) => c.placeId === 'welcome')) return prev
          return [
            {
              id: `welcome-${Date.now()}`,
              placeId: 'welcome',
              placeName: '가입 환영 쿠폰',
              benefit: '첫 방문 F&B 사이드 메뉴 제공',
              area: '부산',
              category: '혜택',
              downloadedAt: new Date().toISOString(),
              used: false,
              kind: 'place',
            },
            ...prev,
          ]
        })
      },
      logout: () => setUserName(null),
      purchaseMembership: (planId: string) => {
        const plan: MembershipPlan | undefined = memberships.find((m) => m.id === planId)
        if (!plan) return
        const expires = new Date()
        expires.setDate(expires.getDate() + plan.days)
        setMembership({
          planId: plan.id,
          name: plan.name,
          expiresAt: expires.toISOString(),
        })
        // 멤버십 결제 시 서핑 멤버스 온리 티켓 활성화
        setOwnedTickets((prev) => {
          if (prev.some((t) => t.ticketId === 'members-only' && !t.used)) return prev
          return [
            {
              id: `mo-${Date.now()}`,
              ticketId: 'members-only',
              name: "서핑 '멤버스 온리' 티켓",
              place: '서프홀릭 전국지점',
              phone: '051-701-4851',
              benefit: '강습 10% 할인 이용권',
              purchasedAt: new Date().toISOString(),
              used: false,
              kind: 'ticket',
            },
            ...prev,
          ]
        })
      },
      downloadCoupon: (placeId: string) => {
        const place = getPlace(placeId)
        if (!place) return { ok: false, message: '장소를 찾을 수 없어요.' }

        const needMembership = !place.freeWithoutMembership
        if (needMembership && !membership) {
          return { ok: false, message: '멤버십이 필요해요. 먼저 이용권을 구매해 주세요.' }
        }

        const already = coupons.some((c) => c.placeId === placeId && !c.used)
        if (already) {
          return { ok: false, message: '이미 받아둔 쿠폰이 있어요. Pay > 쿠폰에서 확인하세요.' }
        }

        setCoupons((prev) => [
          {
            id: `${placeId}-${Date.now()}`,
            placeId: place.id,
            placeName: place.name,
            benefit: place.benefit,
            area: place.area,
            category: place.category,
            downloadedAt: new Date().toISOString(),
            used: false,
            kind: 'place',
          },
          ...prev,
        ])
        return { ok: true, message: '쿠폰을 받았어요! Pay > 쿠폰에서 확인하세요.' }
      },
      useCoupon: (couponId: string) => {
        setCoupons((prev) =>
          prev.map((c) => (c.id === couponId ? { ...c, used: true } : c)),
        )
      },
      buyTicket: (ticketId: string) => {
        const ticket = getTicket(ticketId)
        if (!ticket) return { ok: false, message: '티켓을 찾을 수 없어요.' }
        if (ticket.membersOnly && !membership) {
          return { ok: false, message: '멤버십 회원 전용 티켓이에요.' }
        }
        setOwnedTickets((prev) => [
          {
            id: `${ticketId}-${Date.now()}`,
            ticketId: ticket.id,
            name: ticket.name,
            place: ticket.place,
            phone: ticket.phone,
            benefit: ticket.benefit,
            purchasedAt: new Date().toISOString(),
            used: false,
            kind: 'ticket',
          },
          ...prev,
        ])
        return {
          ok: true,
          message: '구매 완료! Pay > 쿠폰에서 확인 후 업체에 전화 예약하세요.',
        }
      },
      useTicket: (ownedId: string) => {
        setOwnedTickets((prev) =>
          prev.map((t) => (t.id === ownedId ? { ...t, used: true } : t)),
        )
      },
      clearAll: () => {
        setUserName(null)
        setMembership(null)
        setCoupons([])
        setOwnedTickets([])
      },
    }),
    [userName, membership, coupons, ownedTickets],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
