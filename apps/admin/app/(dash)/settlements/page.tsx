'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, won } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Modal, Table, TableSkeleton, Td } from '@/components/ui';

/** 보류 이유 보기 — 눌러서 넣고 고쳐 쓴다 */
const HOLD_PRESETS = ['환불·분쟁 확인 중', '사업자·통장 서류 확인 중', '사용 처리 기록 확인 중'];

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

export default function SettlementsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  // 정산 보류 — 2026-09-24 대표 확정 2-2 B (돈은 토스에서 멈추고, 여기엔 표시와 이유만)
  const [holdFor, setHoldFor] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<any[]>('/admin/settlements').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function generate() {
    const { start, end } = monthRange(0);
    const r = await api<{ count: number }>('/admin/settlements/generate', {
      method: 'POST',
      body: { periodStart: start.toISOString(), periodEnd: end.toISOString() },
    });
    setMsg(`이번 달 정산 ${r.count}건 생성/갱신`);
    load();
  }

  async function confirm(id: string) {
    await api(`/admin/settlements/${id}/confirm`, { method: 'POST' });
    setMsg('정산 확정');
    load();
  }

  async function hold() {
    if (!holdFor) return;
    setBusy(true);
    try {
      await api(`/admin/settlements/${holdFor.id}/hold`, { method: 'POST', body: { reason } });
      setMsg(`'${holdFor.merchant.name}' 정산을 보류로 표시했습니다 — 토스에서도 지급을 멈춰 주세요`);
      setHoldFor(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function release(s: any) {
    if (!confirm2(`'${s.merchant.name}' 정산 보류를 풀까요?\n토스에서 이 가게 몫을 보낼 때 함께 누르세요.`)) return;
    await api(`/admin/settlements/${s.id}/release`, { method: 'POST' });
    setMsg(`'${s.merchant.name}' 정산 보류를 풀었습니다`);
    load();
  }
  const confirm2 = (text: string) => window.confirm(text);
  const heldCount = rows?.filter((s) => s.heldAt).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">정산</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
          <Button onClick={generate}>이번 달 정산 생성</Button>
        </div>
      </div>

      <p className="text-xs text-ink-3">
        정산 기준: 기간 안에 ① <b>가게에서 사용 처리된 이용권</b>의 판매액 ② <b>취소하고 돌려주지 않은 돈</b>(예: 하루 전 취소로 남은 50%) —
        둘 다 가게 몫이고 <b>수수료만 뗍니다</b>. 수수료율은 상품마다 정할 수 있고, 비우면 가게 기본(새 가게 10%)입니다. 상시 할인 혜택에는 수수료가 없습니다.
      </p>
      <p className="text-xs text-ink-3">
        <b>정산 보류</b>: 돈을 멈추는 것은 토스 관리자 화면에서 합니다(그 가게 지급요청서를 보내지 않거나, 예약해 둔 요청을 &lsquo;전송취소&rsquo;).
        여기서 [보류]를 누르면 대시보드와 <b>가게 정산 화면에 &lsquo;보류&rsquo;와 이유</b>가 보입니다.
        {heldCount > 0 && <span className="ml-1 font-bold text-bad">지금 보류 {heldCount}건</span>}
      </p>

      <Card>
        <CardHeader title="정산 내역" />
        {rows === null ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <Empty text="생성된 정산이 없습니다. '이번 달 정산 생성'을 눌러 보세요." />
        ) : (
          <Table head={['상태', '가맹점', '기간', '판매액', '수수료', '지급액', '처리']}>
            {rows.map((s) => (
              <tr key={s.id} className={s.heldAt ? 'bg-bad-soft/40' : ''}>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge>{s.status}</Badge>
                    {s.heldAt && <Badge>보류</Badge>}
                  </div>
                </Td>
                <Td className="font-medium">
                  {s.merchant.name}
                  {s.heldAt && (
                    <div className="max-w-[260px] text-[11px] font-normal leading-4 text-bad">
                      보류 {new Date(s.heldAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} · {s.holdReason}
                    </div>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-3">
                  {new Date(s.periodStart).toLocaleDateString('ko-KR')} ~{' '}
                  {new Date(new Date(s.periodEnd).getTime() - 1).toLocaleDateString('ko-KR')}
                </Td>
                <Td className="tabular-nums">
                  {won(s.grossAmount)}
                  {s.cancelKeptAmount > 0 && <div className="text-[11px] text-ink-3">취소로 남은 돈 {won(s.cancelKeptAmount)} 포함</div>}
                </Td>
                <Td className="tabular-nums text-ink-3">-{won(s.feeAmount)}</Td>
                <Td className="tabular-nums font-semibold">{won(s.netAmount)}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.status === 'PENDING' ? (
                      <Button small onClick={() => confirm(s.id)}>확정</Button>
                    ) : (
                      <span className="text-xs text-ink-3">{s.status === 'PAID' ? '지급 완료' : '확정됨'}</span>
                    )}
                    {s.status !== 'PAID' && (s.heldAt ? (
                      <Button small variant="ghost" onClick={() => release(s)}>보류 풀기</Button>
                    ) : (
                      <Button small variant="danger" onClick={() => { setHoldFor(s); setReason(''); }}>보류</Button>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {holdFor && (
        <Modal title={`정산 보류 — ${holdFor.merchant.name}`} onClose={() => setHoldFor(null)}>
          <p className="mb-3 text-[13px] leading-5 text-ink-2">
            돈을 멈추는 것은 <b className="text-ink">토스 관리자 화면</b>에서 합니다 — 이 가게 지급요청서를 보내지 않거나, 예약해 둔 요청을 &lsquo;전송취소&rsquo;하세요.
            여기에 적는 이유는 <b className="text-ink">가게 정산 화면에 그대로 보입니다.</b>
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {HOLD_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setReason(p)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-2 hover:border-brand hover:text-brand">
                {p}
              </button>
            ))}
          </div>
          <textarea
            className="h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="예) 9월 20일 환불 문의 1건 확인 중 — 해결되면 바로 보내 드립니다"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHoldFor(null)}>취소</Button>
            <Button variant="danger" onClick={hold} disabled={busy || reason.trim().length < 2}>{busy ? '저장 중…' : '보류로 표시'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
