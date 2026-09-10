'use client';
import { useState } from 'react';

/** 수량 인라인 수정 — 호텔이 "방 5개→2개"처럼 직접 조정 (2026-09-10 픽스) */
export function QtyEdit({ current, onSave }: { current: number; onSave: (q: number) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(String(current));
  if (!open) {
    return <button className="ml-2 text-xs font-bold text-brand underline underline-offset-2" onClick={() => { setV(String(current)); setOpen(true); }}>변경</button>;
  }
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      <input
        className="w-16 rounded border border-line bg-white px-1.5 py-0.5 text-center text-xs font-bold outline-none focus:border-brand"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
        autoFocus
      />
      <button className="rounded bg-brand px-2 py-0.5 text-xs font-bold text-white" onClick={() => { onSave(Number(v)); setOpen(false); }}>저장</button>
      <button className="text-xs text-ink-3" onClick={() => setOpen(false)}>✕</button>
    </span>
  );
}
