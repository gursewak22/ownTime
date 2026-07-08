import { useEffect, useState } from 'react';
import { useUserStore } from '@/lib/user-store';

export type NoteLockState = 'pending' | 'owned' | 'locked';

/**
 * Exclusive edit lock for one note, via the Web Locks API. Locks are shared
 * across every panel and every browser tab of this origin, and the browser
 * releases them automatically when the holder unmounts, navigates away, or
 * crashes — no heartbeats, no stale locks.
 *
 * 'owned'  — this panel is the editor.
 * 'locked' — someone else holds it; the caller must render read-only. A
 *            queued request waits in the background, so the moment the owner
 *            closes, this flips to 'owned'.
 *
 * Browsers without navigator.locks just report 'owned' (no protection, same
 * behavior as before this feature).
 */
export function useNoteLock(noteId: string): NoteLockState {
  const userId = useUserStore((s) => s.currentUserId);
  const [state, setState] = useState<NoteLockState>('pending');

  useEffect(() => {
    setState('pending');
    if (!('locks' in navigator)) {
      setState('owned');
      return;
    }
    const name = `scribe-note:${userId}:${noteId}`;
    const ctrl = new AbortController();
    let release: (() => void) | null = null;
    const hold = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });

    void navigator.locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (ctrl.signal.aborted) return undefined;
        if (lock) {
          setState('owned');
          return hold();
        }
        setState('locked');
        // Wait in line: granted as soon as the current owner releases.
        void navigator.locks
          .request(name, { signal: ctrl.signal }, () => {
            setState('owned');
            return hold();
          })
          .catch(() => {
            /* aborted on unmount */
          });
        return undefined;
      })
      .catch(() => setState('owned'));

    return () => {
      ctrl.abort();
      release?.();
    };
  }, [noteId, userId]);

  return state;
}
