import { GoogleLogin } from '@react-oauth/google';
import { LayoutGrid } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { loginWithGoogle } from '@/lib/auth-actions';
import { useAuthStore } from '@/lib/auth-store';

const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type LoginScreenProps = {
  /** Session restore failed because the backend couldn't be reached. */
  serverUnreachable?: boolean;
  onRetry?: () => void;
};

export function LoginScreen({ serverUnreachable, onRetry }: LoginScreenProps) {
  const setDevMode = useAuthStore((s) => s.setDevMode);
  const [error, setError] = useState<string | null>(null);

  async function onCredential(idToken: string) {
    setError(null);
    try {
      await loginWithGoogle(idToken);
    } catch {
      setError('Sign-in failed. Check that the backend is running and the Google client id matches.');
    }
  }

  return (
    <div className="grid h-full place-items-center p-8">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-bg p-8 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          <LayoutGrid className="h-5 w-5 text-accent" />
          ownTime
        </div>

        {serverUnreachable ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Couldn’t reach the server to restore your session.</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">Sign in to open your workspace.</p>
        )}

        {GOOGLE_CLIENT_ID ? (
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={(cred) => {
                if (cred.credential) void onCredential(cred.credential);
              }}
              onError={() => setError('Google sign-in failed.')}
            />
          </div>
        ) : (
          <p className="text-xs text-muted">
            Google sign-in is not configured (set <code>VITE_GOOGLE_CLIENT_ID</code>).
          </p>
        )}

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        {import.meta.env.DEV ? (
          <div className="border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setDevMode(true)}>
              Continue in dev mode (no Google)
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
