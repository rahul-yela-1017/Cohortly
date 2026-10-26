import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, clearToken, getToken, setToken } from '../lib/api';
import { bootKeyring, keyringStatus, KeyringStatus, onKeyringChange, resetKeys, unlockKeyring } from '../lib/crypto';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { ClassInfo, Profile } from '../lib/types';

interface AuthState {
  user: Profile | null;
  classInfo: ClassInfo | null;
  loading: boolean;
  keyring: KeyringStatus;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  regenerateKeys: (password: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyring, setKeyring] = useState<KeyringStatus>(keyringStatus());

  useEffect(() => onKeyringChange(setKeyring), []);

  const boot = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await api<{ user: Profile }>('/me');
      setUser(me);
      const health = await api<ClassInfo>('/auth/class');
      setClassInfo(health);
      const res = await bootKeyring(me.id, me.email || `${me.roll_number}@class`, undefined);
      setKeyring(res.status);
      connectSocket();
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    boot();
    const onUnauthorized = () => {
      setUser(null);
      disconnectSocket();
    };
    window.addEventListener('cc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cc:unauthorized', onUnauthorized);
  }, [boot]);

  const login = useCallback(async (identifier: string, password: string) => {
    // Keep `loading` true through the keyring boot so the app shell doesn't
    // briefly see a stale 'setup' state and flash the unlock dialog while
    // first-login keys are still being generated.
    setLoading(true);
    try {
      const data = await api<{ token: string; user: Profile; class_code: string; class_name: string }>('/auth/login', {
        method: 'POST',
        body: { identifier, password },
      });
      setToken(data.token);
      setUser(data.user);
      setClassInfo({ class_code: data.class_code, class_name: data.class_name });
      const res = await bootKeyring(data.user.id, data.user.email || `${data.user.roll_number}@class`, password);
      setKeyring(res.status);
      connectSocket();
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* token may already be gone */
    }
    clearToken();
    disconnectSocket();
    setUser(null);
    const { clearKeyCache } = await import('../lib/crypto');
    if (user) await clearKeyCache(user.id);
  }, [user]);

  const unlock = useCallback(
    async (password: string) => {
      if (!user) return false;
      let s = await unlockKeyring(user.id, password);
      if (s === 'setup') {
        // Account was activated without device keys (e.g. seeded demo user):
        // create them now, on this device, using the password as passphrase.
        const res = await bootKeyring(user.id, user.email || `${user.roll_number}@class`, password);
        s = res.status;
      }
      setKeyring(s);
      return s === 'ready';
    },
    [user],
  );

  const regenerateKeys = useCallback(
    async (password: string) => {
      if (!user) return false;
      const s = await resetKeys(user.id, user.email || `${user.roll_number}@class`, password);
      setKeyring(s);
      return s === 'ready';
    },
    [user],
  );

  const refresh = useCallback(async () => {
    const { user: me } = await api<{ user: Profile }>('/me');
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, classInfo, loading, keyring, login, logout, refresh, unlock, regenerateKeys }),
    [user, classInfo, loading, keyring, login, logout, refresh, unlock, regenerateKeys],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
