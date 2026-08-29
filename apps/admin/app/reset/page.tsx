'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('비밀번호는 8자 이상이어야 합니다'); return; }
    if (pw !== pw2) { setError('비밀번호가 서로 다릅니다'); return; }
    setBusy(true);
    try {
      await api('/auth/admin/reset', { method: 'POST', body: { token, newPassword: pw } });
      alert('비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.');
      router.replace('/login');
    } catch (err: any) {
      setError(err.message || '변경에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-md bg-bad-soft px-4 py-3 text-sm text-bad">
        잘못된 접근입니다. 이메일의 재설정 링크로 다시 들어와 주세요.
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="mb-1 block text-xs font-semibold text-ink-3">새 비밀번호 (8자 이상)</label>
      <input
        type="password"
        className="mb-4 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <label className="mb-1 block text-xs font-semibold text-ink-3">새 비밀번호 확인</label>
      <input
        type="password"
        className="mb-5 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
      />
      {error && <p className="mb-4 rounded bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p>}
      <button
        disabled={busy}
        className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {busy ? '변경 중…' : '비밀번호 변경'}
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm">
        <div className="mb-1 text-sm font-bold tracking-widest text-brand">HOLIC GEM</div>
        <h1 className="mb-5 text-xl font-bold">비밀번호 재설정</h1>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
