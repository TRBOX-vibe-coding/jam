/** 관리자 API 클라이언트. 토큰은 localStorage에 두고 401이면 로그인으로 보낸다. */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('hg_admin_token');
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem('hg_admin_token', token);
    else localStorage.removeItem('hg_admin_token');
  } catch {
    /* storage 불가 환경 무시 */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth')) {
    setToken(null);
    window.location.href = '/login';
  }
  if (!res.ok) {
    const msg = Array.isArray((data as any).message)
      ? (data as any).message.join(', ')
      : (data as any).message || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const won = (n: number) => `${(n ?? 0).toLocaleString('ko-KR')}원`;
export const dt = (s: string | Date) =>
  new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
