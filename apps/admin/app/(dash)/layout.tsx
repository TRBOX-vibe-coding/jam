'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, setToken } from '@/lib/api';

const DEFAULT_MENU = [
  { href: '/', label: '대시보드', icon: '📊' },
  { href: '/campaigns', label: '기획전', icon: '🎪' },
  { href: '/drops', label: 'DROP 관리', icon: '⚡' },
  { href: '/merchants', label: '가맹점', icon: '🏪' },
  { href: '/products', label: '상품·예약', icon: '🎟️' },
  { href: '/benefits', label: '혜택', icon: '🎁' },
  { href: '/membership', label: '멤버십', icon: '💎' },
  { href: '/users', label: '회원', icon: '👥' },
  { href: '/settlements', label: '정산', icon: '💰' },
  { href: '/translations', label: '번역', icon: '🌐' },
  { href: '/settings', label: '지역·카테고리', icon: '⚙️' },
  { href: '/audit', label: '감사 로그', icon: '🧾' },
];

const ORDER_KEY = 'hg_menu_order';

/** 저장된 순서 + 새로 생긴 메뉴(저장에 없는 것)를 뒤에 붙여 병합 */
function mergeOrder(saved: string[]): string[] {
  const all = DEFAULT_MENU.map((m) => m.href);
  const valid = saved.filter((h) => all.includes(h));
  const missing = all.filter((h) => !valid.includes(h));
  return [...valid, ...missing];
}

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<string[]>(DEFAULT_MENU.map((m) => m.href));
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
    // 저장해둔 "많이 쓰는 순서" 불러오기
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]');
      if (Array.isArray(saved) && saved.length > 0) setOrder(mergeOrder(saved));
    } catch { /* 무시 */ }
  }, [router]);

  if (!ready) return null;

  const menu = order
    .map((href) => DEFAULT_MENU.find((m) => m.href === href))
    .filter(Boolean) as typeof DEFAULT_MENU;

  const logout = () => {
    setToken(null);
    router.replace('/login');
  };

  // ── 드래그로 순서 변경 ──
  function onDragStart(i: number) {
    dragFrom.current = i;
  }
  function onDragEnter(i: number) {
    const from = dragFrom.current;
    if (from === null || from === i) return;
    setOrder((o) => {
      const next = [...o];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragFrom.current = i;
  }
  function onDragEnd() {
    dragFrom.current = null;
    setOrder((o) => {
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(o)); } catch { /* 무시 */ }
      return o;
    });
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* 데스크톱: 좌측 사이드바 */}
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-line bg-white lg:flex">
        <div className="border-b border-line px-5 py-4">
          <div className="text-[13px] font-bold tracking-widest text-brand">HOLIC GEM</div>
          <div className="text-[11px] text-ink-3">본사 관리자</div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
          {menu.map((m, i) => {
            const active = pathname === m.href;
            return (
              <div
                key={m.href}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={onDragEnd}
                title="끌어서 순서를 바꿀 수 있어요"
                className="group flex items-center"
              >
                <span className="w-3 shrink-0 cursor-grab text-center text-[10px] text-line opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">⋮⋮</span>
                <Link
                  href={m.href}
                  draggable={false}
                  className={`flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                    active ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-ground'
                  }`}
                >
                  <span className="text-sm">{m.icon}</span>
                  {m.label}
                </Link>
              </div>
            );
          })}
          <p className="px-3 pt-3 text-[10px] leading-4 text-ink-3">
            메뉴를 끌어서 자주 쓰는 순서로 바꿀 수 있어요
          </p>
        </nav>
        <button
          onClick={logout}
          className="border-t border-line px-5 py-3.5 text-left text-xs font-medium text-ink-3 hover:text-bad"
        >
          로그아웃
        </button>
      </aside>

      {/* 모바일/좁은 화면: 상단 가로 스크롤 칩 — 같은 순서·같은 드래그 */}
      <header className="sticky top-0 z-40 border-b border-line bg-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <span className="text-[13px] font-bold tracking-widest text-brand">HOLIC GEM</span>
            <span className="ml-2 text-[11px] text-ink-3">본사 관리자</span>
          </div>
          <button onClick={logout} className="text-xs font-medium text-ink-3">로그아웃</button>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 [-webkit-overflow-scrolling:touch]">
          {menu.map((m, i) => {
            const active = pathname === m.href;
            return (
              <div
                key={m.href}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={onDragEnd}
                title="끌어서 순서를 바꿀 수 있어요"
              >
                <Link
                  href={m.href}
                  draggable={false}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                    active ? 'bg-brand text-white' : 'bg-ground text-ink-2'
                  }`}
                >
                  {m.icon} {m.label}
                </Link>
              </div>
            );
          })}
        </nav>
      </header>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:ml-52">{children}</main>
    </div>
  );
}
