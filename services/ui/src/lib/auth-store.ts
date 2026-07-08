import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * What the client holds. The refresh token is no longer here — it lives in an
 * HttpOnly cookie the browser sends to /auth automatically and JS cannot read
 * (ADR 0005). Only the short-lived access token (memory) and profile are ours.
 */
export type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

type AuthState = {
  /** Short-lived Bearer token. Memory only — never persisted. */
  accessToken: string | null;
  /** Persisted so a reload knows a session exists and can re-mint via the cookie. */
  user: AuthUser | null;
  /** Dev-only x-user-id mode; only honored when import.meta.env.DEV. */
  devMode: boolean;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
  setDevMode: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      devMode: false,
      setSession: ({ accessToken, user }) => set({ accessToken, user }),
      clearSession: () => set({ accessToken: null, user: null }),
      setDevMode: (devMode) => set({ devMode }),
    }),
    {
      name: 'owntime.auth',
      // The refresh token is a cookie now; only the profile + dev flag persist.
      partialize: (s) => ({ user: s.user, devMode: s.devMode }),
    },
  ),
);

export function isDevMode(): boolean {
  return import.meta.env.DEV && useAuthStore.getState().devMode;
}

// A sign-out in one tab clears the persisted user; mirror it into the others so
// they don't keep trying to refresh a session the cookie no longer backs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'owntime.auth') void useAuthStore.persist.rehydrate();
  });
}
