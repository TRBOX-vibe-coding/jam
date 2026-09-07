'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, getToken, setToken } from '@/lib/api';

const MENU = [
  { href: '/', label: '대시보드', icon: '📊' },
  { href: '/redemptions', label: '사용 내역', icon: '🧾' },
  { href: '/reservations', label: '예약', icon: '📅' },
  { href: '/drops', label: '내 DROP', icon: '⚡' },
  { href: '/products', label: '내 상품', icon: '🎟️' },
  { href: '/benefits', label: '내 혜택', icon: '🎁' },
  { href: '/settlements', label: '정산', icon: '💰' },
];

type MyMerchant = { id: string; name: string; status: string; region: string; category: string };
const MerchantCtx = createContext<MyMerchant | null>(null);
export const useMerchant = () => useContext(MerchantCtx);

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [merchant, setMerchant] = useState<MyMerchant | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api<MyMerchant>('/merchant/my')
      .then((m) => {
        if (m.status === 'PENDING') router.replace('/apply');
        else setMerchant(m);
      })
      .catch(() => router.replace('/apply'));
  }, [router]);

  if (!merchant) return null;

  const logout = () => {
    setToken(null);
    router.replace('/login');
  };

  return (
    <MerchantCtx.Provider value={merchant}>
      <div className="min-h-screen lg:flex">
        {/* 데스크톱: 좌측 사이드바 */}
        <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-line bg-white lg:flex">
          <div className="border-b border-line px-5 py-4">
            <div className="text-[13px] font-bold tracking-widest text-brand">HOLIC GEM</div>
            <div className="mt-0.5 truncate text-sm font-bold">{merchant.name}</div>
            <div className="text-[11px] text-ink-3">사장님 페이지 · {merchant.region}</div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
            {MENU.map((m) => {
              const active = pathname === m.href;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                    active ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-ground'
                  }`}
                >
                  <span className="text-sm">{m.icon}</span>
                  {m.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line px-5 py-3 text-[11px] leading-4 text-ink-3">
            현장 사용 처리는 손님이 매장 QR을 스캔하면 자동으로 끝나요. 이 페이지는 확인·등록용입니다.
          </div>
          <button
            onClick={logout}
            className="border-t border-line px-5 py-3.5 text-left text-xs font-medium text-ink-3 hover:text-bad"
          >
            로그아웃
          </button>
        </aside>

        {/* 모바일: 상단 가로 스크롤 메뉴 */}
        <header className="sticky top-0 z-40 border-b border-line bg-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <span className="text-[13px] font-bold tracking-widest text-brand">HOLIC GEM</span>
              <span className="ml-2 text-xs font-bold">{merchant.name}</span>
            </div>
            <button onClick={logout} className="text-xs font-medium text-ink-3">로그아웃</button>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 [-webkit-overflow-scrolling:touch]">
            {MENU.map((m) => {
              const active = pathname === m.href;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                    active ? 'bg-brand text-white' : 'bg-ground text-ink-2'
                  }`}
                >
                  {m.icon} {m.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:ml-52">{children}</main>
      </div>
    </MerchantCtx.Provider>
  );
}
