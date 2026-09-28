'use client';
/**
 * 이 상품에 회원가를 주는 잼 — 2026-09-24 대표 확정(3-5 A).
 *
 * 회원가는 상품마다 잼을 고르지 않는다. 잼마다 정해 둔 범위(지역·종류·가게 꼬리표)를 그대로 따른다.
 *   잼마스터 = 모든 상품 · 다낭잼 = 다낭 가게 상품만 · 카페잼 = 카페 상품만
 * 여기서는 이 상품만 범위와 다르게 할 잼의 체크를 바꾼다. 바꾼 것만 예외로 저장된다.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Modal } from '@/components/ui';

export function ProductPlansModal({
  product,
  onClose,
}: {
  product: { id: string; name: string };
  onClose: (saved?: boolean) => void;
}) {
  const [data, setData] = useState<any | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<any>(`/admin/products/${product.id}/member-plans`)
      .then((r) => {
        setData(r);
        setPicked(new Set(r.plans.filter((p: any) => p.gives).map((p: any) => p.id)));
      })
      .catch((e) => setMsg(e.message));
  }, [product.id]);

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  /** 예외를 모두 지우고 잼 범위대로 */
  function resetToScope() {
    if (!data) return;
    setPicked(new Set(data.plans.filter((p: any) => p.inScope).map((p: any) => p.id)));
  }

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api(`/admin/products/${product.id}/member-plans`, { method: 'PUT', body: { planIds: [...picked] } });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const p = data?.product;
  const m = p?.merchant;
  const exceptions = data ? data.plans.filter((pl: any) => picked.has(pl.id) !== pl.inScope).length : 0;

  return (
    <Modal title={`회원가 잼 — ${product.name}`} onClose={() => onClose(false)}>
      {!data ? (
        <p className="py-8 text-center text-sm text-ink-3">{msg || '불러오는 중…'}</p>
      ) : (
        <>
          {p.memberPrice == null ? (
            <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] leading-5 text-warn">
              이 상품은 유료 회원가가 없습니다. 회원가를 넣어야 잼 회원이 할인가로 삽니다.
            </p>
          ) : (
            <p className="mb-3 text-[13px] leading-5 text-ink-2">
              회원가 <b className="text-ink">{p.memberPrice.toLocaleString()}원</b>(정상가 {p.basePrice.toLocaleString()}원)은
              잼마다 정해 둔 범위를 따릅니다. 이 가게가 범위에 드는 잼은 저절로 체크되어 있습니다.
              이 상품만 다르게 하려면 체크를 바꾸세요. <b className="text-ink">바꾼 것만 예외로 저장됩니다.</b>
            </p>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-ground/60 px-3 py-2 text-xs text-ink-2">
            <span className="font-semibold text-ink">{m.name}</span>
            <span>· {m.region?.name}</span>
            <span>· {m.category?.emoji} {m.category?.name}</span>
            {(m.tags ?? []).map((t: string) => (
              <span key={t} className="rounded-full bg-ok-soft px-2 py-px text-[11px] font-bold text-ok">{t}</span>
            ))}
          </div>

          <div className="divide-y divide-line rounded-lg border border-line">
            {data.plans.map((pl: any) => {
              const on = picked.has(pl.id);
              const differs = on !== pl.inScope;
              return (
                <label key={pl.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${on ? 'bg-brand/5' : 'hover:bg-ground'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(pl.id)} className="size-4" disabled={p.memberPrice == null} />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{pl.name}</span>
                    {pl.isPrivate && <span className="ml-1.5 rounded bg-ground px-1.5 py-px text-[10px] font-bold text-ink-3">단체</span>}
                    {!pl.isActive && <span className="ml-1.5 rounded bg-ground px-1.5 py-px text-[10px] font-bold text-ink-3">판매 중지</span>}
                    <span className="block text-[11px] text-ink-3">{pl.inScope ? '잼 범위 안 — 원래 회원가를 받음' : '잼 범위 밖 — 원래 회원가 없음'}</span>
                  </span>
                  {differs && (
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${on ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
                      {on ? '예외: 더함' : '예외: 뺌'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {msg && <p className="mt-2 text-[13px] text-bad">{msg}</p>}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={resetToScope}
              disabled={exceptions === 0}
              className="text-xs font-semibold text-ink-3 underline underline-offset-2 disabled:no-underline disabled:opacity-40"
            >
              예외 없애고 잼 범위대로 ({exceptions})
            </button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onClose(false)}>취소</Button>
              <Button onClick={save} disabled={busy || p.memberPrice == null}>{busy ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
