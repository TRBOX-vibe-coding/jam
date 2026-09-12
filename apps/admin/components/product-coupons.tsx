'use client';
/**
 * 결제 상품에 묶어 파는 '근처 할인 쿠폰' 설정 — 슈퍼 관리자 전용.
 *
 * 2026-09-12 대표 확정:
 *  - 점주는 자기 상품과 판매 가격까지만. 쿠폰을 붙이는 건 홀릭잼(본사)만 한다.
 *  - 여기서 고른 쿠폰은 상품 상세에 미리 보이고, 결제하면 바로 발급된다.
 *  - 발급된 쿠폰은 무료 회원도 실제로 쓴다 — 이게 유료 전환 유도의 핵심이다.
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
  const [startMode, setStartMode] = useState('PURCHASE');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<any>(`/admin/products/${product.id}/coupons`)
      .then((r) => {
        setData(r);
        setPicked(r.linked.map((l: any) => l.benefitId));
        setValidDays(r.validDays ? String(r.validDays) : '');
        setStartMode(r.product?.couponStartMode ?? 'PURCHASE');
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
        body: { benefitIds: picked, validDays: validDays ? Number(validDays) : undefined, startMode },
      });
      onClose(true);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const candidates: any[] = data?.candidates ?? [];
  const shown = q
    ? candidates.filter((b) => b.title.includes(q) || b.merchant.name.includes(q))
    : candidates;

  return (
    <Modal title={`근처 쿠폰 묶기 · ${product.name}`} onClose={() => onClose(false)} wide>
      <p className="mb-3 text-[13px] leading-5 text-ink-2">
        여기서 고른 쿠폰은 상품 상세에 미리 보이고, 손님이 결제하면 바로 발급됩니다.
        <b className="text-ink"> 무료 회원도 이 쿠폰은 실제로 씁니다.</b> 근처 2~4곳을 골라주세요.
      </p>

      <div className="mb-3 rounded-lg border border-line bg-ground/50 p-3">
        <p className="mb-2 text-xs font-semibold text-ink-3">쿠폰이 언제부터 열릴까요</p>
        <div className="flex flex-col gap-1.5">
          {[
            ['PURCHASE', '결제하는 순간', '부산에 사는 손님, 바로 쓸 상품'],
            ['REDEEM', '현장에서 이용권을 쓰는 순간', '날짜가 정해지지 않은 티켓 (권장)'],
            ['RESERVATION', '예약 확정일 00시', '날짜·시간이 정해진 예약 상품'],
          ].map(([v, label, hint]) => (
            <label key={v} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="startMode"
                checked={startMode === v}
                onChange={() => setStartMode(v)}
                className="mt-1 size-4"
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="ml-2 text-xs text-ink-3">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} max-w-[220px]`}
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
        <Empty text="같은 지역에 묶을 수 있는 다른 가맹점 쿠폰이 없습니다" />
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
