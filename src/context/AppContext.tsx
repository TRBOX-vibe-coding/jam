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
}

type AppContextValue = {
  membership: ActiveMembership | null
  coupons: Coupon[]
  purchaseMembership: (planId: string) => void
  downloadCoupon: (placeId: string) => { ok: boolean; message: string }
  useCoupon: (couponId: string) => void
  clearAll: () => void
}

const STORAGE_KEY = 'holicgem-demo-v1'

type Stored = {
  membership: ActiveMembership | null
  coupons: Coupon[]
}

const AppContext = createContext<AppContextValue | null>(null)

function loadStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { membership: null, coupons: [] }
    return JSON.parse(raw) as Stored
  } catch {
    return { membership: null, coupons: [] }
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [membership, setMembership] = useState<ActiveMembership | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = loadStored()
    if (stored.membership) {
      const expired = new Date(stored.membership.expiresAt).getTime() < Date.now()
      setMembership(expired ? null : stored.membership)
      setCoupons(expired ? [] : stored.coupons)
    } else {
      setCoupons(stored.coupons)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ membership, coupons } satisfies Stored),
    )
  }, [membership, coupons, ready])

  const value = useMemo<AppContextValue>(
    () => ({
      membership,
      coupons,
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
      },
      downloadCoupon: (placeId: string) => {
        if (!membership) {
          return { ok: false, message: '멤버십이 필요해요. 먼저 이용권을 구매해 주세요.' }
        }
        const place = getPlace(placeId)
        if (!place) return { ok: false, message: '장소를 찾을 수 없어요.' }

        const already = coupons.some((c) => c.placeId === placeId && !c.used)
        if (already) {
          return { ok: false, message: '이미 받아둔 쿠폰이 있어요. 내 쿠폰에서 확인해 주세요.' }
        }

        const coupon: Coupon = {
          id: `${placeId}-${Date.now()}`,
          placeId: place.id,
          placeName: place.name,
          benefit: place.benefit,
          area: place.area,
          category: place.category,
          downloadedAt: new Date().toISOString(),
          used: false,
        }
        setCoupons((prev) => [coupon, ...prev])
        return { ok: true, message: '쿠폰을 받았어요! 매장에서 보여주세요.' }
      },
      useCoupon: (couponId: string) => {
        setCoupons((prev) =>
          prev.map((c) => (c.id === couponId ? { ...c, used: true } : c)),
        )
      },
      clearAll: () => {
        setMembership(null)
        setCoupons([])
      },
    }),
    [membership, coupons],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
