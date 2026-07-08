import type { QueryClient } from '@tanstack/react-query';
import { api } from './api-client';
import { useAuthStore } from './auth-store';
import type { AuthSession } from './auth-store';
import { useUserStore } from './user-store';

export async function loginWithGoogle(idToken: string): Promise<void> {
  // Sets the HttpOnly refresh cookie server-side; the body carries only the
  // access token + profile.
  const session = await api<AuthSession>('/auth/google', { method: 'POST', body: { idToken } });
  useAuthStore.getState().setSession(session);
  // Keep the existing userId source of truth in sync so every TanStack Query
  // key and the persisted workspace layout follow the authenticated user.
  useUserStore.setState({ currentUserId: session.user.id });
}

export async function logout(queryClient: QueryClient): Promise<void> {
  // The refresh cookie identifies the family to revoke; best-effort, since
  // losing the network must not block signing out locally.
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  useAuthStore.getState().clearSession();
  if (import.meta.env.DEV) {
    useUserStore.setState({ currentUserId: 'demo' });
  }
  queryClient.clear();
}
