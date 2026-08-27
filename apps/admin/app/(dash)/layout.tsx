'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, setToken } from '@/lib/api';

const MENU = [
  { href: '/', label: '대시보드', icon: '📊' },
  { href: '/drops', label: 'DROP 관리', icon: '⚡' },
  { href: '/merchants', label: '가맹점', icon: '🏪' },
  { href: '/users', label: '회원', icon: '👥' },
  { href: '/settlements', label: '정산', icon: '💰' },
  { href: '/audit', label: '감사 로그', icon: '🧾' },
];

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-52 flex-col border-r border-line bg-white">
        <div className="border-b border-line px-5 py-4">
          <div className="text-[13px] font-bold tracking-widest text-brand">HOLIC GEM</div>
          <div className="text-[11px] text-ink-3">본사 관리자</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2.5">
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
        <button
          onClick={() => {
            setToken(null);
            router.replace('/login');
          }}
          className="border-t border-line px-5 py-3.5 text-left text-xs font-medium text-ink-3 hover:text-bad"
        >
          로그아웃
        </button>
      </aside>
      <main className="ml-52 flex-1 p-6">{children}</main>
    </div>
  );
}
