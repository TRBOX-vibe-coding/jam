'use client';
/**
 * 결제 상품에 묶어 파는 '근처 할인 쿠폰' 설정 — 슈퍼 관리자 전용.
 *
 * 2026-09-12 대표 확정:
 *  - 점주는 자기 상품과 판매 가격까지만. 쿠폰을 붙이는 건 홀릭잼(본사)만 한다.
 *  - 여기서 고른 쿠폰은 상품 상세에 미리 보이고, 결제하면 손님 앱에 담긴다.
 *  - 발급된 쿠폰은 무료 회원도 실제로 쓴다 — 이게 유료 전환 유도의 핵심이다.
 * 2026-09-24 대표 확정(3-2): 쿠폰이 언제 열리는지는 여기서 고르지 않는다. 상품 종류와 손님이 고른
 * '가는 날'로 저절로 정해진다 (api/src/bundled-coupons.util.ts).
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Button, Empty, Modal } from '@/components/ui';

const inputCls =
  'h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand';

function valueText(b: { type: string; value: number; freebieName?: string | null }) {
  if (b.type === 'PERCENT') return `${b.value}%`;
  if (b.type === 'AMOUNT') return `${b.value.toLocaleString()}원`;
  if (b.type === 'AMOUNT_PER_PERSON') return `1인당 ${b.value.toLocaleString()}원`;
  return b.freebieName ?? '증정';
}

export function ProductCouponsModal({
  product,
  onClose,
}: {
  product: { id: string; name: string };
  onClose: (saved?: boolean) => void;
}) {
  const [data, setData] = useState<any | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [validDays, setValidDays] = useState('');
  const [q, setQ] = useState('');
  const [regionId, setRegionId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<any>(`/admin/products/${product.id}/coupons`)
      .then((r) => {
        setData(r);
        setPicked(r.linked.map((l: any) => l.benefitId));
        setValidDays(r.validDays ? String(r.validDays) : '');
      })
      .catch((e) => setMsg(e.message));
  }, [product.id]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 10 ? p : [...p, id]));
  }

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api(`/admin/products/${product.id}/coupons`, {
        method: 'POST',
        body: { benefitIds: picked, validDays: validDays ? Number(validDays) : undefined },
      });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const candidates: any[] = data?.candidates ?? [];
  // 고를 수 있는 지역·종류 — 후보 쿠폰에 있는 것만
  const regions = [...new Map(candidates.map((b) => [b.merchant.region?.id, b.merchant.region?.name])).entries()].filter(([id]) => id);
  const categories = [...new Map(candidates.map((b) => [b.merchant.category?.id, b.merchant.category])).entries()].filter(([id]) => id);
  const shown = candidates.filter((b) =>
    (!regionId || b.merchant.region?.id === regionId) &&
    (!categoryId || b.merchant.category?.id === categoryId) &&
    (!q || b.title.includes(q) || b.merchant.name.includes(q)),
  );

  return (
    <Modal title={`딸려 줄 쿠폰 · ${product.name}`} onClose={() => onClose(false)} wide>
      <p className="mb-3 text-[13px] leading-5 text-ink-2">
        여기서 고른 쿠폰은 상품 상세에 미리 보이고, 손님이 결제하면 손님 앱에 담깁니다.
        <b className="text-ink"> 무료 회원도 이 쿠폰은 실제로 씁니다.</b> 전체 쿠폰에서 지역·종류로 찾아 고르세요.
        같은 지역 쿠폰이 위에 먼저 나옵니다.
      </p>

      <div className="mb-3 rounded-lg border border-line bg-ground/50 p-3">
        <p className="mb-1.5 text-xs font-semibold text-ink-3">쿠폰이 열리는 때 — 고를 필요 없이 저절로 정해집니다</p>
        <ul className="flex flex-col gap-1 text-[13px] leading-5 text-ink-2">
          {data?.product?.type === 'RESERVATION' ? (
            <li>· 예약 상품이라 <b className="text-ink">손님이 예약한 날 0시</b>에 열립니다.</li>
          ) : (
            <>
              <li>· 손님이 결제할 때 <b className="text-ink">&lsquo;가는 날&rsquo;을 고르면 그날 0시</b>에 열립니다.</li>
              <li>· 가는 날을 안 고르면 <b className="text-ink">가게에서 이용권을 쓸 때</b> 열립니다.</li>
            </>
          )}
          <li>· 그보다 먼저 가게에서 이용권을 쓰면 그 자리에서 바로 열립니다.</li>
          <li>· 열린 날부터 아래 &lsquo;사용 기간&rsquo;(비우면 90일) 동안 쓸 수 있습니다.</li>
        </ul>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className={`${inputCls} max-w-[140px]`} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">지역 전체</option>
          {regions.map(([id, name]) => (
            <option key={id} value={id}>{name}{id === data?.productRegionId ? ' (같은 지역)' : ''}</option>
          ))}
        </select>
        <select className={`${inputCls} max-w-[140px]`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">종류 전체</option>
          {categories.map(([id, c]: any) => (
            <option key={id} value={id}>{c.emoji} {c.name}</option>
          ))}
        </select>
        <input
          className={`${inputCls} max-w-[200px]`}
          placeholder="쿠폰·가맹점 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          className={`${inputCls} max-w-[150px]`}
          placeholder="사용 기간(기본 90일)"
          value={validDays}
          onChange={(e) => setValidDays(e.target.value.replace(/\D/g, ''))}
        />
        <Badge>{`${picked.length} / 10 선택`}</Badge>
      </div>

      {msg && <p className="mb-2 text-[13px] text-bad">{msg}</p>}

      {!data ? (
        <p className="py-8 text-center text-sm text-ink-3">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <Empty text="조건에 맞는 쿠폰이 없습니다" />
      ) : (
        <div className="max-h-[46vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {shown.map((b) => {
            const on = picked.includes(b.id);
            return (
              <label
                key={b.id}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${on ? 'bg-brand/5' : 'hover:bg-ground'}`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(b.id)} className="size-4" />
                <span className="min-w-[74px] rounded-md bg-[#FFF1EC] px-2 py-1 text-center text-[13px] font-bold text-[#E8503A]">
                  {valueText(b)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {b.merchant.category?.emoji} {b.merchant.name} · {b.merchant.region?.name}
                    {b.merchant.region?.id === data?.productRegionId && (
                      <span className="ml-1.5 rounded bg-brand-soft px-1 py-px text-[10px] font-bold text-brand">같은 지역</span>
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(false)}>취소</Button>
        <Button onClick={save} disabled={busy || !data}>{busy ? '저장 중…' : '저장'}</Button>
      </div>
    </Modal>
  );
}
