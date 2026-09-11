import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

export type Me = {
  id: string;
  nickname: string;
  provider: string;
  membership: {
    planCode: string; planName: string; source: string; startAt: string; endAt: string;
    /** 유료 잼인지 (FREE 플랜이면 false) */
    isPaid: boolean;
    /** 사용 시작일이 지났는지 (미리 결제한 잼은 시작 전엔 false) */
    started: boolean;
  } | null;
  savings: { thisMonth: number; total: number; recoveryRate: number | null };
  ownedMerchant: { id: string; name: string; status: string } | null;
};

type AuthCtx = {
  ready: boolean;
  me: Me | null;
  login: (provider: string, providerId: string, nickname?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  ready: false,
  me: null,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>('/me'));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const login = useCallback(
    async (provider: string, providerId: string, nickname?: string) => {
      const r = await api<{ token: string }>('/auth/social', {
        method: 'POST',
        body: { provider, providerId, nickname },
      });
      await setToken(r.token);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await setToken(null);
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ ready, me, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
