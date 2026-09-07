'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Button, Card } from '@/components/ui';

type Opt = { id: string; name: string; emoji?: string };

export default function ApplyPage() {
  const router = useRouter();
  const [regions, setRegions] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    name: '', regionId: '', categoryId: '', address: '',
    bizRegNo: '', ownerName: '', contactPhone: '', contactEmail: '', intro: '',
  });

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api<Opt[]>('/regions').then(setRegions).catch(() => {});
    api<Opt[]>('/categories').then(setCategories).catch(() => {});
    // 이미 신청했으면 대기 안내, 이미 승인됐으면 대시보드로
    api<{ status: string }>('/merchant/my')
      .then((m) => {
        if (m.status === 'PENDING') setPending(true);
        else router.replace('/');
      })
      .catch(() => {});
  }, [router]);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api('/merchant/apply', { method: 'POST', body: { ...f, intro: f.intro || undefined } });
      setPending(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';
  const valid = f.name.length >= 2 && f.regionId && f.categoryId && f.address.length >= 5
    && f.bizRegNo.length >= 10 && f.ownerName.length >= 2 && f.contactPhone.length >= 10 && f.contactEmail.includes('@');

  if (pending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ground p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="text-4xl">⏳</div>
          <h1 className="mt-3 text-lg font-bold">입점 신청이 접수됐습니다</h1>
          <p className="mt-2 text-sm leading-6 text-ink-2">
            본사 승인이 끝나면 이 페이지에서 판매 현황·예약·상품 등록을 바로 쓸 수 있어요.
            보통 1영업일 안에 처리됩니다.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={() => window.location.reload()}>승인됐는지 확인</Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ground p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-1 text-sm font-bold tracking-widest text-brand">HOLIC GEM</div>
        <h1 className="text-xl font-bold">입점 신청</h1>
        <p className="mb-5 mt-1 text-xs text-ink-3">가게 정보를 입력하면 본사 승인 후 사장님 페이지가 열립니다.</p>

        <Card className="p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">가게 이름 *</label>
              <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="예) 송정 서프샵" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">지역 *</label>
              <select className={inputCls} value={f.regionId} onChange={(e) => setF({ ...f, regionId: e.target.value })}>
                <option value="">선택</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">업종 *</label>
              <select className={inputCls} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                <option value="">선택</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">주소 *</label>
              <input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="부산 해운대구 ..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">사업자등록번호 *</label>
              <input className={inputCls} value={f.bizRegNo} onChange={(e) => setF({ ...f, bizRegNo: e.target.value })} placeholder="123-45-67890" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">대표자 이름 *</label>
              <input className={inputCls} value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">연락처 *</label>
              <input className={inputCls} value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} placeholder="010-1234-5678" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-3">이메일 *</label>
              <input className={inputCls} value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} placeholder="owner@shop.com" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink-3">한 줄 소개</label>
              <input className={inputCls} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} placeholder="예) 송정 앞바다 10초, 서핑 전문점" />
            </div>
          </div>

          {error && <p className="mt-4 rounded bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p>}

          <div className="mt-5 flex justify-end">
            <Button onClick={submit} disabled={!valid || busy}>{busy ? '접수 중…' : '입점 신청하기'}</Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
