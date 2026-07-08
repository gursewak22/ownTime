import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { UserSwitcher } from '@/components/shell/UserSwitcher';
import { logout } from '@/lib/auth-actions';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Header identity area: the signed-in Google profile with sign-out, or — in
 * dev mode — the legacy user switcher behind a visible "dev" badge.
 */
export function AuthMenu() {
  const user = useAuthStore((s) => s.user);
  const devMode = useAuthStore((s) => s.devMode);
  const setDevMode = useAuthStore((s) => s.setDevMode);
  const queryClient = useQueryClient();

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {user.picture ? (
          <img
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            className="h-6 w-6 rounded-full"
          />
        ) : null}
        <span className="max-w-40 truncate text-sm">{user.name ?? user.email ?? user.id}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void logout(queryClient)}
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    );
  }

  if (import.meta.env.DEV && devMode) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-accent">
          dev
        </span>
        <UserSwitcher />
        <Button variant="ghost" size="sm" onClick={() => setDevMode(false)} title="Exit dev mode">
          Exit
        </Button>
      </div>
    );
  }

  return null;
}
