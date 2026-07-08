import { useEffect, useState } from 'react';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { refreshSession } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { WorkspaceShell } from '@/workspace/WorkspaceShell';

type RestoreState = 'idle' | 'pending' | 'unreachable';

export function App() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const devMode = useAuthStore((s) => s.devMode);

  // The access token lives in memory only, so a reload with a persisted user
  // must rotate the refresh token before rendering the workspace — otherwise
  // every parallel query would open with a 401.
  const [restore, setRestore] = useState<RestoreState>(() =>
    useAuthStore.getState().user && !useAuthStore.getState().accessToken ? 'pending' : 'idle',
  );

  useEffect(() => {
    if (restore !== 'pending') return;
    let cancelled = false;
    // Single-flight inside refreshSession makes StrictMode's double effect harmless.
    void refreshSession().then((result) => {
      if (!cancelled) setRestore(result === 'unreachable' ? 'unreachable' : 'idle');
    });
    return () => {
      cancelled = true;
    };
  }, [restore]);

  const authed = (!!user && !!accessToken) || (import.meta.env.DEV && devMode);
  if (authed) return <WorkspaceShell />;
  if (restore === 'pending') {
    return <div className="grid h-full place-items-center text-sm text-muted">Signing in…</div>;
  }
  return (
    <LoginScreen
      serverUnreachable={restore === 'unreachable'}
      onRetry={() => setRestore('pending')}
    />
  );
}
