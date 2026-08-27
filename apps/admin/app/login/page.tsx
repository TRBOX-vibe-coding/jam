'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@holicgem.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string }>('/auth/admin/login', {
        method: 'POST',
        body: { email, password },
      });
      setToken(r.token);
      router.replace('/');
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm">
        <div className="mb-1 text-sm font-bold tracking-widest text-brand">HOLIC GEM</div>
        <h1 className="mb-6 text-xl font-bold">본사 관리자</h1>

        <label className="mb-1 block text-xs font-semibold text-ink-3">이메일</label>
        <input
          className="mb-4 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />

        <label className="mb-1 block text-xs font-semibold text-ink-3">비밀번호</label>
        <input
          type="password"
          className="mb-5 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <p className="mb-4 rounded bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p>}

        <button
          disabled={busy}
          className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {busy ? '확인 중…' : '로그인'}
        </button>

        <p className="mt-4 text-center text-[11px] text-ink-3">개발용 계정 admin@holicgem.com / admin1234</p>
      </form>
    </main>
  );
}
