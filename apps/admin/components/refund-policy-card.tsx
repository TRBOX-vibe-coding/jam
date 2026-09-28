'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, CardHeader } from '@/components/ui';

/**
 * 취소·환불 규정 — 2026-09-28 대표: "몇 분으로 할지 묻지 말고 슈퍼 관리자가 정하게 하자".
 * 여기서 바꾼 숫자가 앱의 결제 전 안내와 주문·취소 화면의 환불 금액 계산에 그대로 쓰인다.
 */
type Policy = {
  graceMinutes: number;
  sameDayPercent: number;
  dayBeforePercent: number;
  twoDaysBeforePercent: number;
  undatedMonths: number;
  csContact: string;
  csLink: string;
};

const inputCls = 'w-20 rounded-md border border-line bg-white px-2 py-1.5 text-right text-sm font-bold tabular-nums outline-none focus:border-brand';
const textCls = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand';

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
      <div className="w-56 shrink-0 text-sm text-ink-2">{label}</div>
      <div className="flex items-center gap-2 text-sm">{children}</div>
      {hint && <div className="w-full pl-0 text-[11px] text-ink-3 sm:pl-60">{hint}</div>}
    </div>
  );
}

export function RefundPolicyCard() {
  const [p, setP] = useState<Policy | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Policy>('/admin/settings/refund-policy').then(setP).catch(() => {});
  }, []);

  if (!p) {
    return (
      <Card>
        <CardHeader title="취소·환불 규정" />
        <div className="p-5 text-xs text-ink-3">불러오는 중…</div>
      </Card>
    );
  }

  const num = (k: keyof Policy, max: number) => (
    <input
      className={inputCls}
      value={String(p[k])}
      onChange={(e) => {
        const v = Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 0);
        setP({ ...p, [k]: v });
      }}
    />
  );

  async function save() {
    if (!p) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await api<{ message: string }>('/admin/settings/refund-policy', { method: 'PUT', body: p });
      setMsg(r.message);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="취소·환불 규정"
        right={msg ? <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span> : undefined}
      />
      <div className="px-5 pb-5 pt-2">
        <p className="mb-2 text-xs text-ink-3">
          여기서 바꾼 숫자는 앱의 결제 전 안내와, [주문·취소] 화면에서 돌려줄 금액을 계산할 때 그대로 쓰입니다.
        </p>

        <div className="divide-y divide-line">
          <Row label="결제 직후 전액 환불" hint="이 시간 안에 취소하면 어떤 상품이든 전액 돌려줍니다. 야놀자·여기어때는 10분~1시간입니다.">
            결제 후 {num('graceMinutes', 1440)} 분 안
          </Row>
          <Row label="예약 상품 — 이용 이틀 전부터">{num('twoDaysBeforePercent', 100)} % 환불</Row>
          <Row label="예약 상품 — 이용 하루 전">{num('dayBeforePercent', 100)} % 환불</Row>
          <Row label="예약 상품 — 이용 당일">{num('sameDayPercent', 100)} % 환불</Row>
          <Row label="날짜 없는 티켓·PASS" hint="가게에서 사용 처리하기 전에만 환불됩니다.">
            구매 후 {num('undatedMonths', 24)} 개월까지 전액 환불
          </Row>
          <Row label="잼(멤버십)">
            <span className="text-ink-2">시작일 전 취소는 전액, 시작일부터는 환불 없음 <span className="text-ink-3">(9/28 대표 확정)</span></span>
          </Row>
          <Row label="함께 받은 쿠폰">
            <span className="text-ink-2">하나라도 쓰면 그 상품은 취소 안 됨 <span className="text-ink-3">(9/28 대표 확정)</span></span>
          </Row>
          <Row label="취소 요청 받는 곳" hint="앱 안내에 그대로 나옵니다. 예) 카카오톡 '홀릭잼' 채널, 고객센터 051-000-0000">
            <input className={`${textCls} sm:w-80`} value={p.csContact} placeholder="카카오톡 '홀릭잼' 채널" onChange={(e) => setP({ ...p, csContact: e.target.value })} />
          </Row>
          <Row label="누르면 열 주소 (선택)" hint="카카오톡 채널 주소를 넣으면 손님이 안내 문구를 눌러 바로 문의할 수 있습니다.">
            <input className={`${textCls} sm:w-80`} value={p.csLink} placeholder="https://pf.kakao.com/..." onChange={(e) => setP({ ...p, csLink: e.target.value })} />
          </Row>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
        </div>
      </div>
    </Card>
  );
}
