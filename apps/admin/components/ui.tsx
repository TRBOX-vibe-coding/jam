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
