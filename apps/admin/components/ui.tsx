'use client';
import { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(16,24,32,.05)] ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="px-5 py-4">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </Card>
  );
}

const badgeStyles: Record<string, string> = {
  OPEN: 'bg-ok-soft text-ok',
  SCHEDULED: 'bg-brand-soft text-brand',
  PENDING: 'bg-warn-soft text-warn',
  SOLD_OUT: 'bg-line text-ink-3',
  CLOSED: 'bg-line text-ink-3',
  REJECTED: 'bg-bad-soft text-bad',
  CANCELLED: 'bg-bad-soft text-bad',
  ACTIVE: 'bg-ok-soft text-ok',
  SUSPENDED: 'bg-bad-soft text-bad',
  DONE: 'bg-ok-soft text-ok',
  PAID: 'bg-ok-soft text-ok',
  CONFIRMED: 'bg-brand-soft text-brand',
  B2B_GRANT: 'bg-warn-soft text-warn',
  PURCHASE: 'bg-ok-soft text-ok',
  정상: 'bg-ok-soft text-ok',
  정지: 'bg-warn-soft text-warn',
  탈퇴: 'bg-bad-soft text-bad',
  NO_SHOW: 'bg-bad-soft text-bad',
  COMPLETED: 'bg-ok-soft text-ok',
  REQUESTED: 'bg-brand-soft text-brand',
};

export function Badge({ children }: { children: string }) {
  const cls = badgeStyles[children] ?? 'bg-line text-ink-2';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function Button({
  children, onClick, variant = 'primary', disabled, small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  small?: boolean;
}) {
  const base =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand/90'
      : variant === 'danger'
        ? 'bg-bad-soft text-bad hover:bg-bad hover:text-white'
        : 'border border-line bg-white text-ink-2 hover:bg-ground';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md font-semibold transition-colors disabled:opacity-40 ${base} ${
        small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'
      }`}
    >
      {children}
    </button>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line bg-ground/60 text-left text-xs text-ink-3">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}

export function Empty({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-ink-3">{text}</div>;
}

/** 로딩 스켈레톤 — 데이터 도착 전 "없음" 대신 자리 표시자를 보여준다 */
export function Skel({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line/60 ${className}`} />;
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0 divide-y divide-line">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skel key={c} className={`h-4 ${c === 1 ? 'w-2/5' : 'w-1/6'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <Card className="px-5 py-4">
      <Skel className="h-3 w-24" />
      <Skel className="mt-2 h-7 w-32" />
      <Skel className="mt-2 h-3 w-20" />
    </Card>
  );
}

/** 페이지네이션 — {page, pages} 기준 이전/다음 + 현재 위치 */
export function Pagination({
  page, pages, onPage,
}: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-3 text-sm">
      <Button small variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>← 이전</Button>
      <span className="tabular-nums text-ink-2">{page} / {pages}</span>
      <Button small variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>다음 →</Button>
    </div>
  );
}

/** 공용 모달 래퍼 */
export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[85vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-xl bg-white`}
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader title={title} right={<Button small variant="ghost" onClick={onClose}>닫기</Button>} />
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
