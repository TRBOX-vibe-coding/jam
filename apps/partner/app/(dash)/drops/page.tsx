'use client';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api, dt, fileToDataUrl, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, TableSkeleton, Td } from '@/components/ui';

const img = (u?: string | null, w = 160) => (u ? (u.startsWith('/') ? `${API_BASE}${u}?w=${w}` : u) : null);

const EMPTY = {
  title: '', description: '', kind: 'DEAL', normalPrice: '', dropPrice: '',
  totalQty: '', personsPerUnit: '1', openDate: '', closeDate: '',
};

export default function MyDropsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<any[]>('/merchant/my/drops').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('이미지는 5MB 이하여야 합니다'); return; }
    setPhoto(await fileToDataUrl(file));
  }

  async function create() {
    setBusy(true);
    try {
      const openAt = f.openDate ? new Date(`${f.openDate}T10:00:00`) : new Date();
      const r = await api<{ message: string }>('/merchant/my/drops', {
        method: 'POST',
        body: {
          title: f.title,
          description: f.description || undefined,
          kind: f.kind,
          normalPrice: Number(f.normalPrice),
          dropPrice: Number(f.dropPrice),
          totalQty: Number(f.totalQty),
          personsPerUnit: Number(f.personsPerUnit) || 1,
          openAt: openAt.toISOString(),
          closeAt: new Date(`${f.closeDate}T23:59:59`).toISOString(),
          imageBase64: photo ?? undefined,
        },
      });
      setMsg(r.message);
      setF(EMPTY);
      setPhoto(null);
      setShowCreate(false);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';
  const valid = f.title.length >= 4 && Number(f.normalPrice) >= 1000 && Number(f.dropPrice) >= 100 && Number(f.totalQty) >= 1 && f.closeDate;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">내 DROP</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '닫기' : '＋ DROP 등록'}</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">한정수량 딜입니다. 등록하면 <b>본사 승인 후</b> 앱에 오픈됩니다.</p>

      {showCreate && (
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <input className={`${inputCls} col-span-2`} placeholder="딜 제목 * (예: 오늘 저녁 보드 렌탈 반값)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="DEAL">현장 결제 딜 (무료 받기)</option>
              <option value="TICKET">앱에서 결제 (티켓)</option>
            </select>
            <input className={inputCls} placeholder="1개당 인원" value={f.personsPerUnit} onChange={(e) => setF({ ...f, personsPerUnit: e.target.value.replace(/\D/g, '') })} />
            <input className={`${inputCls} col-span-2 lg:col-span-4`} placeholder="설명" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <input className={inputCls} placeholder="정상가 *" value={f.normalPrice} onChange={(e) => setF({ ...f, normalPrice: e.target.value.replace(/\D/g, '') })} />
            <input className={inputCls} placeholder="딜 가격 *" value={f.dropPrice} onChange={(e) => setF({ ...f, dropPrice: e.target.value.replace(/\D/g, '') })} />
            <input className={inputCls} placeholder="총 수량 *" value={f.totalQty} onChange={(e) => setF({ ...f, totalQty: e.target.value.replace(/\D/g, '') })} />
            <input className={inputCls} type="date" title="마감일 *" value={f.closeDate} onChange={(e) => setF({ ...f, closeDate: e.target.value })} />
            <div className="col-span-2 flex items-center gap-2 lg:col-span-4">
              <label className="cursor-pointer whitespace-nowrap rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-ground">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} />
                {photo ? '📁 사진 변경' : '📁 사진 올리기'}
              </label>
              {photo && <img src={photo} alt="미리보기" className="h-9 w-12 rounded object-cover" />}
              <div className="flex-1" />
              <Button onClick={create} disabled={!valid || busy}>{busy ? '등록 중…' : '등록 요청 (본사 승인)'}</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={`내 딜 (${rows?.length ?? '…'})`} />
        {rows === null ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="등록한 딜이 없습니다" />
        ) : (
          <Table head={['상태', '딜', '가격', '남은/전체', '마감']}>
            {rows.map((d) => (
              <tr key={d.id}>
                <Td><Badge>{d.status}</Badge></Td>
                <Td className="max-w-[300px]">
                  <div className="flex items-center gap-2.5">
                    {img(d.imageUrl) ? (
                      <img src={img(d.imageUrl)!} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-ground text-[10px] text-ink-3">사진없음</div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{d.title}</div>
                      <div className="truncate text-xs text-ink-3">{d.description}</div>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  <span className="text-ink-3 line-through">{won(d.normalPrice)}</span> <b>{won(d.dropPrice)}</b>
                </Td>
                <Td className="tabular-nums">{d.remainingQty}/{d.totalQty}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">{dt(d.closeAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
