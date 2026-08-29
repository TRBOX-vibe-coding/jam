/**
 * API 클라이언트.
 * 개발 중에는 Expo가 알려주는 개발 머신 주소(hostUri)에서 IP를 뽑아
 * 같은 와이파이의 폰에서도 별도 설정 없이 API(4000)에 붙는다.
 */
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

function resolveBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const hostUri: string | undefined =
    (Constants.expoConfig as any)?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && Platform.OS !== 'web') {
      return `http://${host}:4000`;
    }
  }
  return 'http://localhost:4000';
}

export const API_BASE = resolveBase();

/** 서버 상대경로(/uploads/..) 이미지를 절대 주소로 바꾼다. 외부 URL은 그대로. */
export function img(u?: string | null): string | undefined {
  if (!u) return undefined;
  return u.startsWith('/') ? API_BASE + u : u;
}

const TOKEN_KEY = 'hg_token';
let cachedToken: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token;
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장 실패해도 세션 동안은 메모리로 동작 */
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
  const token = await getToken();
  const res = await fetch(API_BASE + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray((data as any).message)
      ? (data as any).message.join(', ')
      : (data as any).message || `오류 (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}
