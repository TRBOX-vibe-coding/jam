'use client';
/**
 * 본사 대시보드 — 2026-09-19 문서 4-6, 대표가 요청한 12개 항목.
 * 맨 위에 '할 일'(승인 대기·정산 보류·번역·품절 임박·기간 끝나감)을 모으고,
 * 거래액은 오늘·이번 주·이번 달과 같은 시각의 어제·지난주·지난달을 나란히 둔다.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, dt, won } from '@/lib/api';
import { Badge, Card, CardHeader, Empty, Stat, StatSkeleton, Table, TableSkeleton, Td } from '@/components/ui';

type Stats = {
  users: number; activeMemberships: number; activeMerchants: number;
  openDrops: number; pendingDrops: number;
  todayRedemptions: number; monthRedemptions: number;
  monthGmv: number; monthOrderCount: number; monthSavedAmount: number;
};
type Money = { amount: number; count: number };
type Dash = {
  generatedAt: string;
  gmv: { today: Money; yesterday: Money; week: Money; lastWeek: Money; month: Money; lastMonth: Money };
  compare: { label: string; unit: string; today: number; yesterday: number; week: number; lastWeek: number }[];
  plans: { id: string; name: string; price: number; isActive: boolean; isPrivate: boolean; active: number; bought: number; amount: number; viewers: number; conversion: number | null }[];
  products: { id: string; name: string; type: string; merchant: string; orders: number; qty: number; amount: number }[];
  coupons: { id: string; title: string; merchant: string; uses: number; saved: number }[];
  merchants: { id: string; name: string; coupon: number; deal: number; voucher: number; saved: number; total: number }[];
  payments: { failed: number; failedTracked: boolean; cancelled: number; refunded: number; cancelledPaid: number };
  lowStock: { kind: string; id: string; name: string; merchant: string; left: number; total: number; at: string | null }[];
  pending: { merchants: number; benefits: number; products: number; drops: number; total: number };
  holds: { id: string; periodStart: string; periodEnd: string; netAmount: number; heldAt: string; holdReason: string | null; merchant: { name: string } }[];
  translations: { merchants: number; benefits: number; products: number; total: number; of: number };
  ending: { id: string; name: string; merchant: string; saleTo: string | null; useTo: string | null }[];
};

/** 늘고 줄어든 정도 — 같은 시각끼리 비교한 값 */
function delta(cur: number, prev: number): { text: string; cls: string } {
  if (cur === prev) return { text: '같음', cls: 'text-ink-3' };
  if (prev === 0) return { text: '새로 생김', cls: 'text-ok' };
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return { text: '비슷함', cls: 'text-ink-3' };
  return { text: `${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%`, cls: p > 0 ? 'text-ok' : 'text-bad' };
}
const num = (v: number, unit: string) => (unit === '원' ? won(v) : `${v.toLocaleString()}${unit}`);
const md = (s: string) => { const [, m, d] = s.split('-'); return `${Number(m)}.${Number(d)}`; };
const dmd = (s: string) => new Date(s).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

/** 맨 위 '할 일' 칩 — 숫자가 있으면 색을 켠다 */
function Todo({ href, label, n, detail }: { href: string; label: string; n: number; detail?: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        n > 0 ? 'border-warn/30 bg-warn-soft text-warn' : 'border-line bg-white text-ink-3'
      }`}
    >
      <span className="font-semibold">{label}</span>
      <span className="text-base font-bold tabular-nums">{n}</span>
      {detail && <span className="text-[11px] opacity-80">{detail}</span>}
      <span aria-hidden>→</span>
    </Link>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [redemptions, setRedemptions] = useState<any[]>([]);

  useEffect(() => {
    api<Stats>('/admin/stats').then(setStats).catch(() => {});
    api<Dash>('/admin/dashboard').then(setDash).catch(() => {});
    api<any[]>('/admin/redemptions?days=7').then(setRedemptions).catch(() => {});
  }, []);

  if (!stats || !dash) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">대시보드</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
        </div>
        <Card><CardHeader title="불러오는 중" /><TableSkeleton rows={6} cols={6} /></Card>
      </div>
    );
  }

  const g = dash.gmv;
  const p = dash.pending;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-bold">대시보드</h1>
        <span className="text-xs text-ink-3">{dt(dash.generatedAt)} 기준 · 비교는 같은 시각끼리</span>
      </div>

      {/* ⑧⑨⑩⑦⑪ 할 일 */}
      <div className="flex flex-wrap gap-2">
        <Todo
          href="/products"
          label="승인 대기"
          n={p.total}
          detail={`가맹점 ${p.merchants} · 쿠폰 ${p.benefits} · 상품 ${p.products} · DROP ${p.drops}`}
        />
        <Todo href="/settlements" label="정산 보류" n={dash.holds.length} />
        <Todo
          href="/translations"
          label="번역 빠짐"
          n={dash.translations.total}
          detail={`가게 ${dash.translations.merchants} · 쿠폰 ${dash.translations.benefits} · 상품 ${dash.translations.products}`}
        />
        <Todo href="/products" label="품절 임박" n={dash.lowStock.length} />
        <Todo href="/products" label="기간 끝나감" n={dash.ending.length} detail="7일 안" />
      </div>

      {/* ① 거래액 — 오늘·이번 주·이번 달 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ['오늘 거래액', g.today, g.yesterday, '어제 같은 시각보다'],
          ['이번 주 거래액', g.week, g.lastWeek, '지난주 같은 시각보다'],
          ['이번 달 거래액', g.month, g.lastMonth, '지난달 같은 날보다'],
        ] as [string, Money, Money, string][]).map(([label, cur, prev, vs]) => {
          const d = delta(cur.amount, prev.amount);
          return (
            <Card key={label} className="px-5 py-4">
              <div className="text-xs font-medium text-ink-3">{label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{won(cur.amount)}</div>
              <div className="mt-0.5 text-xs text-ink-3">
                주문 {cur.count}건 · {vs} <b className={d.cls}>{d.text}</b>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="이번 달 현장 사용" value={`${stats.monthRedemptions}건`} sub={`오늘 ${stats.todayRedemptions}건`} />
        <Stat label="이번 달 고객 절약액" value={won(stats.monthSavedAmount)} sub="멤버십 가치의 증거" />
        <Stat label="전체 회원" value={stats.users.toLocaleString()} sub={`유효 멤버십 ${stats.activeMemberships.toLocaleString()}`} />
        <Stat label="운영 중 가맹점" value={stats.activeMerchants.toLocaleString()} sub={`오픈 중 DROP ${stats.openDrops}개`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* ⑫ 어제·지난주 대비 */}
        <Card>
          <CardHeader title="어제 · 지난주보다" />
          <Table head={['항목', '오늘', '어제', '변화', '이번 주', '지난주', '변화']}>
            {dash.compare.map((c) => {
              const d1 = delta(c.today, c.yesterday);
              const d2 = delta(c.week, c.lastWeek);
              return (
                <tr key={c.label}>
                  <Td className="font-medium">{c.label}</Td>
                  <Td className="tabular-nums">{num(c.today, c.unit)}</Td>
                  <Td className="tabular-nums text-ink-3">{num(c.yesterday, c.unit)}</Td>
                  <Td className={`whitespace-nowrap text-xs font-bold ${d1.cls}`}>{d1.text}</Td>
                  <Td className="tabular-nums">{num(c.week, c.unit)}</Td>
                  <Td className="tabular-nums text-ink-3">{num(c.lastWeek, c.unit)}</Td>
                  <Td className={`whitespace-nowrap text-xs font-bold ${d2.cls}`}>{d2.text}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>

        {/* ② 잼별 가입·구매·전환율 */}
        <Card>
          <CardHeader title="잼별 가입 · 구매 · 전환율 (이번 달)" />
          <Table head={['잼', '이용 중', '구매', '금액', '잼 화면 본 사람', '전환율']}>
            {dash.plans.map((pl) => (
              <tr key={pl.id} className={pl.isActive ? '' : 'opacity-60'}>
                <Td className="font-medium">
                  {pl.name}
                  {pl.isPrivate && <span className="ml-1 text-[11px] font-normal text-warn">단체</span>}
                </Td>
                <Td className="tabular-nums">{pl.active.toLocaleString()}명</Td>
                <Td className="tabular-nums">{pl.bought}건</Td>
                <Td className="tabular-nums">{won(pl.amount)}</Td>
                <Td className="tabular-nums text-ink-3">{pl.viewers}명</Td>
                <Td className="tabular-nums font-semibold">{pl.conversion != null ? `${pl.conversion}%` : '—'}</Td>
              </tr>
            ))}
          </Table>
          <p className="px-5 pb-4 pt-1 text-[11px] text-ink-3">전환율 = 이번 달 잼 화면을 본 사람 중 그 잼을 산 사람의 비율. 잼 화면 조회는 9월 28일부터 셉니다.</p>
        </Card>

        {/* ③ 상품별 판매량·매출 */}
        <Card>
          <CardHeader title="상품별 판매량 · 매출 (이번 달)" />
          {dash.products.length === 0 ? (
            <Empty text="이번 달 판매가 아직 없습니다" />
          ) : (
            <Table head={['상품', '판매', '매출']}>
              {dash.products.map((x) => (
                <tr key={x.id}>
                  <Td className="max-w-[260px]">
                    <div className="truncate font-medium">{x.name}</div>
                    <div className="truncate text-[11px] text-ink-3">{x.merchant}</div>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {x.qty}{x.type === 'RESERVATION' ? '명' : '장'}
                    <span className="ml-1 text-[11px] text-ink-3">주문 {x.orders}</span>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums font-semibold">{won(x.amount)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ④ 쿠폰별 실제 사용 횟수 */}
        <Card>
          <CardHeader title="쿠폰별 실제 사용 횟수 (이번 달)" />
          {dash.coupons.length === 0 ? (
            <Empty text="이번 달 쿠폰 사용이 아직 없습니다" />
          ) : (
            <Table head={['쿠폰', '사용', '손님 절약']}>
              {dash.coupons.map((x) => (
                <tr key={x.id}>
                  <Td className="max-w-[280px]">
                    <div className="truncate font-medium">{x.title}</div>
                    <div className="truncate text-[11px] text-ink-3">{x.merchant}</div>
                  </Td>
                  <Td className="tabular-nums font-semibold">{x.uses}번</Td>
                  <Td className="tabular-nums">{won(x.saved)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ⑤ 가맹점별 사용 실적 */}
        <Card>
          <CardHeader title="가맹점별 사용 실적 (이번 달)" />
          {dash.merchants.length === 0 ? (
            <Empty text="이번 달 사용 기록이 아직 없습니다" />
          ) : (
            <Table head={['가게', '쿠폰', '딜', '이용권', '합계', '손님 절약']}>
              {dash.merchants.map((x) => (
                <tr key={x.id}>
                  <Td className="font-medium">{x.name}</Td>
                  <Td className="tabular-nums">{x.coupon}</Td>
                  <Td className="tabular-nums">{x.deal}</Td>
                  <Td className="tabular-nums">{x.voucher}</Td>
                  <Td className="tabular-nums font-semibold">{x.total}건</Td>
                  <Td className="tabular-nums">{won(x.saved)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ⑥ 결제 실패·환불·취소 */}
        <Card>
          <CardHeader title="결제 실패 · 환불 · 취소 (이번 달)" />
          <div className="grid grid-cols-3 gap-3 px-5 pb-5">
            <div>
              <div className="text-xs text-ink-3">결제 실패</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{dash.payments.failedTracked ? `${dash.payments.failed}건` : '—'}</div>
              <div className="text-[11px] text-ink-3">토스를 붙이면 셉니다</div>
            </div>
            <div>
              <div className="text-xs text-ink-3">취소</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{dash.payments.cancelled}건</div>
              <div className="text-[11px] text-ink-3">결제액 {won(dash.payments.cancelledPaid)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-3">환불</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{won(dash.payments.refunded)}</div>
              <div className="text-[11px] text-ink-3">
                <Link href="/orders" className="text-brand underline underline-offset-2">주문·취소</Link>에서 기록한 금액
              </div>
            </div>
          </div>
        </Card>

        {/* ⑦ 품절 임박 */}
        <Card>
          <CardHeader title="품절 임박" />
          {dash.lowStock.length === 0 ? (
            <Empty text="곧 다 팔릴 상품이 없습니다" />
          ) : (
            <Table head={['종류', '이름', '남은 수']}>
              {dash.lowStock.map((x) => (
                <tr key={`${x.kind}-${x.id}`}>
                  <Td><Badge>{x.kind}</Badge></Td>
                  <Td className="max-w-[300px]">
                    <div className="truncate font-medium">{x.name}</div>
                    <div className="truncate text-[11px] text-ink-3">{x.merchant}{x.at ? ` · ${dt(x.at)}` : ''}</div>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums font-semibold text-bad">{x.left} / {x.total}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ⑪ 판매·이용 기간이 끝나가는 상품 */}
        <Card>
          <CardHeader title="판매 · 이용 기간이 7일 안에 끝나는 상품" />
          {dash.ending.length === 0 ? (
            <Empty text="곧 끝나는 상품이 없습니다" />
          ) : (
            <Table head={['상품', '가게', '판매 끝', '이용 끝']}>
              {dash.ending.map((x) => (
                <tr key={x.id}>
                  <Td className="max-w-[240px] truncate font-medium">{x.name}</Td>
                  <Td className="whitespace-nowrap text-ink-3">{x.merchant}</Td>
                  <Td className="tabular-nums">{x.saleTo ? md(x.saleTo) : '—'}</Td>
                  <Td className="tabular-nums">{x.useTo ? md(x.useTo) : '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ⑨ 정산 보류 */}
        <Card>
          <CardHeader title={`정산 보류 (${dash.holds.length})`} />
          {dash.holds.length === 0 ? (
            <Empty text="보류한 정산이 없습니다" />
          ) : (
            <Table head={['가게', '기간', '지급액', '보류한 날', '이유']}>
              {dash.holds.map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap font-medium">{h.merchant.name}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-3">{dmd(h.periodStart)} ~ {dmd(new Date(new Date(h.periodEnd).getTime() - 1).toISOString())}</Td>
                  <Td className="tabular-nums">{won(h.netAmount)}</Td>
                  <Td className="whitespace-nowrap text-xs">{dmd(h.heldAt)}</Td>
                  <Td className="max-w-[260px] text-xs text-bad">{h.holdReason}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ⑧ 승인 대기 · ⑩ 번역이 빠진 것 */}
        <Card>
          <CardHeader title="승인 대기 · 번역이 빠진 것" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 pb-5 text-sm">
            <div className="text-xs font-semibold text-ink-3">승인 대기</div>
            <div className="text-xs font-semibold text-ink-3">영어·중국어·일본어 이름이 빠진 것</div>
            <div className="space-y-1">
              <Link href="/merchants" className="flex justify-between hover:text-brand"><span>가맹점</span><b className="tabular-nums">{p.merchants}</b></Link>
              <Link href="/benefits" className="flex justify-between hover:text-brand"><span>쿠폰</span><b className="tabular-nums">{p.benefits}</b></Link>
              <Link href="/products" className="flex justify-between hover:text-brand"><span>상품</span><b className="tabular-nums">{p.products}</b></Link>
              <Link href="/drops" className="flex justify-between hover:text-brand"><span>DROP</span><b className="tabular-nums">{p.drops}</b></Link>
            </div>
            <div className="space-y-1">
              <Link href="/translations" className="flex justify-between hover:text-brand"><span>가게</span><b className="tabular-nums">{dash.translations.merchants}</b></Link>
              <Link href="/translations" className="flex justify-between hover:text-brand"><span>쿠폰</span><b className="tabular-nums">{dash.translations.benefits}</b></Link>
              <Link href="/translations" className="flex justify-between hover:text-brand"><span>상품</span><b className="tabular-nums">{dash.translations.products}</b></Link>
              <div className="flex justify-between text-ink-3"><span>전체 중</span><span className="tabular-nums">{dash.translations.of}개</span></div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="최근 현장 사용 (7일)" />
        {redemptions.length === 0 ? (
          <Empty text="아직 사용 기록이 없습니다" />
        ) : (
          <Table head={['시각', '회원', '매장', '항목', '유형', '인원', '절약액', '상태']}>
            {redemptions.slice(0, 12).map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-ink-3">{dt(r.createdAt)}</Td>
                <Td>{r.user.nickname}</Td>
                <Td>{r.merchant.name}</Td>
                <Td className="max-w-[220px] truncate">
                  {r.userBenefit?.benefit.title ?? r.dropClaim?.drop.title ?? r.voucher?.product.name ?? '-'}
                </Td>
                <Td><Badge>{r.type}</Badge></Td>
                <Td className="tabular-nums">{r.headcount}명</Td>
                <Td className="tabular-nums">{won(r.savedAmount)}</Td>
                <Td><Badge>{r.status}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
