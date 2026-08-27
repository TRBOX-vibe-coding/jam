'use client';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, Empty, Table, Td } from '@/components/ui';

export default function MerchantsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [qrPreview, setQrPreview] = useState<{ name: string; code: string; dataUrl: string } | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<any[]>('/admin/merchants').then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function issueQr(id: string, name: string) {
    const qr = await api<{ code: string }>(`/admin/merchants/${id}/qr`, { method: 'POST', body: { label: '카운터' } });
    setMsg(`${name} QR 발급 완료`);
    await showQr(name, qr.code);
    load();
  }

  async function showQr(name: string, code: string) {
    const dataUrl = await QRCode.toDataURL(code, { width: 480, margin: 2 });
    setQrPreview({ name, code, dataUrl });
  }

  async function approve(m: any) {
    await api(`/admin/merchants/${m.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } });
    setMsg(`${m.name} 입점 승인 완료`);
    load();
  }

  async function toggleStatus(m: any) {
    const next = m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api(`/admin/merchants/${m.id}`, { method: 'PATCH', body: { status: next } });
    setMsg(`${m.name} → ${next === 'ACTIVE' ? '운영 재개' : '일시 중지'}`);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">가맹점</h1>
        {msg && <span className="rounded bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">{msg}</span>}
      </div>

      <Card>
        <CardHeader title={`전체 가맹점 (${rows.length})`} />
        {rows.length === 0 ? (
          <Empty text="가맹점이 없습니다" />
        ) : (
          <Table head={['상태', '가맹점', '지역/카테고리', '수수료율', '사용/DROP', '매장 QR', '관리']}>
            {rows.map((m) => (
              <tr key={m.id}>
                <Td><Badge>{m.status}</Badge></Td>
                <Td>
                  <div className="font-medium">{m.name}</div>
                  {(m.ownerName || m.bizRegNo) && (
                    <div className="max-w-[260px] text-[11px] text-ink-3">
                      대표 {m.ownerName ?? '-'} · 사업자 {m.bizRegNo ?? '-'}
                      {m.contactPhone && <> · {m.contactPhone}</>}
                      {m.contactEmail && <> · {m.contactEmail}</>}
                      {m.address && <div className="truncate">{m.address}</div>}
                    </div>
                  )}
                  <div className="max-w-[200px] truncate text-xs text-ink-3">{m.intro}</div>
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {m.region.name} · {m.category.emoji} {m.category.name}
                </Td>
                <Td className="tabular-nums">{Number(m.commissionRate)}%</Td>
                <Td className="tabular-nums text-xs text-ink-3">
                  사용 {m._count.redemptions} · DROP {m._count.drops}
                </Td>
                <Td>
                  {m.qrCodes.length > 0 ? (
                    <button
                      onClick={() => showQr(m.name, m.qrCodes[0].code)}
                      className="text-xs font-semibold text-brand underline underline-offset-2"
                    >
                      QR 보기
                    </button>
                  ) : (
                    <span className="text-xs text-ink-3">미발급</span>
                  )}
                </Td>
                <Td>
                  <div className="flex gap-1.5">
                    {m.status === 'PENDING' ? (
                      <Button small onClick={() => approve(m)}>입점 승인</Button>
                    ) : (
                      <>
                        <Button small variant="ghost" onClick={() => issueQr(m.id, m.name)}>QR 발급</Button>
                        <Button small variant={m.status === 'ACTIVE' ? 'danger' : 'primary'} onClick={() => toggleStatus(m)}>
                          {m.status === 'ACTIVE' ? '중지' : '재개'}
                        </Button>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {qrPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setQrPreview(null)}
        >
          <div className="w-full max-w-xs rounded-xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold">{qrPreview.name}</div>
            <div className="mb-3 text-[11px] text-ink-3">매장 카운터 비치용 고정 QR</div>
            <img src={qrPreview.dataUrl} alt="매장 QR" className="mx-auto w-56" />
            <div className="mt-2 break-all font-mono text-[10px] text-ink-3">{qrPreview.code}</div>
            <div className="mt-4 flex justify-center gap-2">
              <Button small variant="ghost" onClick={() => window.print()}>인쇄</Button>
              <Button small onClick={() => setQrPreview(null)}>닫기</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
