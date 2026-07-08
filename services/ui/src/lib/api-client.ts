/// <reference types="vite/client" />
import { isDevMode, useAuthStore } from './auth-store';
import type { AuthSession } from './auth-store';
import { getCurrentUserId, useUserStore } from './user-store';

// Default is same-origin: the UI service proxies /auth, /preferences, /todos
// and /scribe to the backend services (nginx in prod, Vite proxy in dev), so
// the browser never needs to know where services live. Set VITE_API_URL only
// to bypass the proxy and hit one origin directly.
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

function buildUrl(path: string): URL {
  return new URL(path.replace(/^\//, ''), `${API_URL}/`);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

function authHeaders(): Record<string, string> {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) return { authorization: `Bearer ${accessToken}` };
  if (isDevMode()) return { 'x-user-id': getCurrentUserId() };
  return {};
}

/** True when a reload/expiry can be recovered by refreshing via the cookie. */
function hasRestorableSession(): boolean {
  return !isDevMode() && useAuthStore.getState().user !== null;
}

/** Retry once after a successful refresh; the new access token rides in via authHeaders(). */
async function fetchWithAuthRetry(doFetch: () => Promise<Response>): Promise<Response> {
  const res = await doFetch();
  if (res.status !== 401 || !hasRestorableSession()) return res;
  if ((await refreshSession()) !== 'ok') return res;
  return doFetch();
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = opts;

  const url = buildUrl(path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  // FormData bodies (file uploads) set their own multipart content-type.
  const isForm = body instanceof FormData;
  const res = await fetchWithAuthRetry(() =>
    fetch(url, {
      method,
      // Send the HttpOnly refresh cookie on /auth calls (harmless elsewhere).
      credentials: 'include',
      headers: {
        ...(isForm ? {} : { 'content-type': 'application/json' }),
        ...authHeaders(),
      },
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    }),
  );

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const message = extractMessage(parsed) ?? res.statusText;
    throw new ApiError(res.status, message, parsed);
  }

  return parsed as T;
}

/** GET a binary response (e.g. a stored PDF) with the same auth seam. */
export async function apiBinary(path: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = buildUrl(path);
  const res = await fetchWithAuthRetry(() =>
    fetch(url, { credentials: 'include', headers: authHeaders(), signal }),
  );
  if (!res.ok) {
    const text = await res.text();
    const parsed = text ? safeJson(text) : undefined;
    throw new ApiError(res.status, extractMessage(parsed) ?? res.statusText, parsed);
  }
  return res.arrayBuffer();
}

export type RefreshResult = 'ok' | 'rejected' | 'unreachable';

// Single-flight: concurrent 401s (parallel queries, StrictMode double-effects)
// share one rotation instead of racing each other's tokens.
let refreshInFlight: Promise<RefreshResult> | null = null;

export function refreshSession(): Promise<RefreshResult> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<RefreshResult> {
  if (!hasRestorableSession()) return 'rejected';

  let res: Response;
  try {
    // The refresh token rides in the HttpOnly cookie; nothing to send in the body.
    res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Server unreachable: keep the session — being offline must not log the user out.
    return 'unreachable';
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      useAuthStore.getState().clearSession();
      return 'rejected';
    }
    return 'unreachable';
  }

  const session = (await res.json()) as AuthSession;
  useAuthStore.getState().setSession(session);
  useUserStore.setState({ currentUserId: session.user.id });
  return 'ok';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(parsed: unknown): string | undefined {
  if (parsed && typeof parsed === 'object' && 'message' in parsed) {
    const m = (parsed as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return undefined;
}
