'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/auth/admin/forgot', { method: 'POST', body: { email } });
      setDone(r.message);
    } catch (err: any) {
      setDone(err.message || '요청에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-sm">
        <div className="mb-1 text-sm font-bold tracking-widest text-brand">HOLIC GEM</div>
        <h1 className="mb-2 text-xl font-bold">비밀번호 찾기</h1>
        <p className="mb-5 text-xs text-ink-3">가입한 관리자 이메일을 입력하면 재설정 링크를 보내드립니다.</p>

        {done ? (
          <div className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">{done}</div>
        ) : (
          <>
            <label className="mb-1 block text-xs font-semibold text-ink-3">이메일</label>
            <input
              type="email"
              required
              className="mb-5 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@holicgem.com"
            />
            <button
              disabled={busy}
              className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {busy ? '전송 중…' : '재설정 링크 보내기'}
            </button>
          </>
        )}
        <p className="mt-4 text-center text-xs">
          <a href="/login" className="text-ink-3 underline underline-offset-2">로그인으로 돌아가기</a>
        </p>
      </form>
    </main>
  );
}
