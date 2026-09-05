'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';

export default function SettingsPage() {
  const [regions, setRegions] = useState<any[] | null>(null);
  const [categories, setCategories] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const [rf, setRf] = useState({ name: '', city: '부산광역시', country: '대한민국' });
  const [cf, setCf] = useState({ name: '', emoji: '' });

  const load = useCallback(() => {
    api<any[]>('/admin/regions').then(setRegions).catch(() => setRegions([]));
    api<any[]>('/admin/categories').then(setCategories).catch(() => setCategories([]));
  }, []);
  useEffect(load, [load]);

  async function addRegion() {
    try {
      await api('/admin/regions', { method: 'POST', body: { name: rf.name, city: rf.city, country: rf.country } });
      setMsg(`'${rf.name}' 지역 추가 — 앱 지역 필터에 바로 노출됩니다`);
      setRf({ name: '', city: '부산광역시', country: '대한민국' });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function toggleRegion(r: any) {
    await api(`/admin/regions/${r.id}`, { method: 'PATCH', body: { isOpen: !r.isOpen } });
    setMsg(`'${r.name}' → ${r.isOpen ? '숨김 (앱에서 제외)' : '오픈'}`);
    load();
  }

  async function renameRegion(r: any) {
    const name = prompt('지역 이름 수정', r.name);
    if (!name || name === r.name) return;
    await api(`/admin/regions/${r.id}`, { method: 'PATCH', body: { name } });
    setMsg(`'${r.name}' → '${name}' 변경`);
    load();
  }

  async function renameCategory(c: any) {
    const name = prompt('카테고리 이름 수정', c.name);
    if (!name || name === c.name) return;
    await api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { name } });
    setMsg(`'${c.name}' → '${name}' 변경`);
    load();
  }

  async function addCategory() {
    try {
      await api('/admin/categories', { method: 'POST', body: { name: cf.name, emoji: cf.emoji || undefined } });
      setMsg(`'${cf.name}' 카테고리 추가`);
      setCf({ name: '', emoji: '' });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function toggleCategory(c: any) {
    await api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } });
    setMsg(`'${c.name}' → ${c.isActive ? '숨김' : '노출'}`);
    load();
  }

  const inputCls = 'rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">지역 · 카테고리</h1>
        {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
      </div>

      <p className="text-xs text-ink-3">
        앱의 지역 필터와 카테고리 타일을 관리합니다. 국가 → 도시 → 지역 구조라
        나중에 <b>다낭·호이안</b> 같은 해외 확장도 여기서 국가만 바꿔 추가하면 됩니다.
      </p>

      {/* 지역 */}
      <Card>
        <CardHeader title={`지역 (${regions?.length ?? '…'})`} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <input className={`${inputCls} w-32`} placeholder="지역명 * (예: 기장)" value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} />
          <input className={`${inputCls} w-36`} placeholder="도시" value={rf.city} onChange={(e) => setRf({ ...rf, city: e.target.value })} />
          <input className={`${inputCls} w-32`} placeholder="국가" value={rf.country} onChange={(e) => setRf({ ...rf, country: e.target.value })} />
          <Button small onClick={addRegion} disabled={rf.name.length < 1}>추가</Button>
        </div>
        {regions === null ? (
          <TableSkeleton rows={5} cols={5} />
        ) : regions.length === 0 ? (
          <Empty text="지역이 없습니다" />
        ) : (
          <Table head={['상태', '지역', '도시', '국가', '가맹점/DROP', '관리']}>
            {regions.map((r) => (
              <tr key={r.id} className={r.isOpen ? '' : 'opacity-60'}>
                <Td><Badge>{r.isOpen ? 'OPEN' : 'CLOSED'}</Badge></Td>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-xs text-ink-3">{r.city}</Td>
                <Td className="text-xs text-ink-3">{r.country}</Td>
                <Td className="tabular-nums text-xs text-ink-3">{r._count.merchants} / {r._count.drops}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Button small variant="ghost" onClick={() => renameRegion(r)}>이름 수정</Button>
                    <Button small variant={r.isOpen ? 'danger' : 'primary'} onClick={() => toggleRegion(r)}>
                      {r.isOpen ? '숨김' : '오픈'}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* 카테고리 */}
      <Card>
        <CardHeader title={`카테고리 (${categories?.length ?? '…'})`} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <input className={`${inputCls} w-40`} placeholder="카테고리명 * (예: 뷰티)" value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
          <input className={`${inputCls} w-24`} placeholder="이모지" value={cf.emoji} onChange={(e) => setCf({ ...cf, emoji: e.target.value })} />
          <Button small onClick={addCategory} disabled={cf.name.length < 1}>추가</Button>
        </div>
        {categories === null ? (
          <TableSkeleton rows={5} cols={4} />
        ) : categories.length === 0 ? (
          <Empty text="카테고리가 없습니다" />
        ) : (
          <Table head={['상태', '카테고리', '가맹점', '관리']}>
            {categories.map((c) => (
              <tr key={c.id} className={c.isActive ? '' : 'opacity-60'}>
                <Td><Badge>{c.isActive ? 'ACTIVE' : 'CLOSED'}</Badge></Td>
                <Td className="font-medium">{c.emoji} {c.name}</Td>
                <Td className="tabular-nums text-xs text-ink-3">{c._count.merchants}곳</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Button small variant="ghost" onClick={() => renameCategory(c)}>이름 수정</Button>
                    <Button small variant={c.isActive ? 'danger' : 'primary'} onClick={() => toggleCategory(c)}>
                      {c.isActive ? '숨김' : '노출'}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
