'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

const SOCIALS = [
  { provider: 'KAKAO', label: '카카오로 시작', bg: '#FEE500', fg: '#191600' },
  { provider: 'NAVER', label: '네이버로 시작', bg: '#03C75A', fg: '#fff' },
  { provider: 'GOOGLE', label: 'Google로 시작', bg: '#fff', fg: '#1F1F1F' },
  { provider: 'APPLE', label: 'Apple로 시작', bg: '#000', fg: '#fff' },
];

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** 앱과 같은 소셜 간편 로그인. 데모 기간엔 임시 계정으로 연결된다. */
  async function login(provider: string, providerId: string) {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string }>('/auth/social', {
        method: 'POST',
        body: { provider, providerId },
      });
      setToken(r.token);
      // 가게 연결 여부에 따라 대시보드 or 입점 신청으로
      try {
        await api('/merchant/my');
        router.replace('/');
      } catch {
        router.replace('/apply');
      }
    } catch (e: any) {
      setError(e.message || '로그인에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm">
        <div className="mb-1 text-sm font-bold tracking-widest text-brand">HOLIC GEM</div>
        <h1 className="text-xl font-bold">사장님 페이지</h1>
        <p className="mb-6 mt-2 text-xs leading-5 text-ink-3">
          앱과 같은 계정으로 로그인합니다. 가게가 아직 없으면
          로그인 후 바로 입점 신청으로 이어집니다.
        </p>

        <div className="space-y-2">
          {SOCIALS.map((s) => (
            <button
              key={s.provider}
              disabled={busy}
              onClick={() => login(s.provider, `demo-${s.provider.toLowerCase()}-owner`)}
              className="w-full rounded-lg border border-line py-2.5 text-sm font-bold disabled:opacity-50"
              style={{ backgroundColor: s.bg, color: s.fg }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 rounded bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p>}

        <p className="mt-5 text-center text-[11px] text-ink-3">데모 기간: 임시 계정으로 로그인됩니다 (소셜 연동 전)</p>
        <p className="mt-2 text-center text-xs">
          <button
            className="text-brand underline underline-offset-2"
            disabled={busy}
            onClick={() => login('KAKAO', 'demo-owner-2')}
          >
            [시연용] 승인된 점주로 로그인 (서프홀릭)
          </button>
        </p>
      </div>
    </main>
  );
}
