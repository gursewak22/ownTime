/// <reference types="vite/client" />
import { getCurrentUserId } from './user-store';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = opts;

  const url = new URL(path.replace(/^\//, ''), `${API_URL}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  // FormData bodies (file uploads) set their own multipart content-type.
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: {
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      'x-user-id': getCurrentUserId(),
    },
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

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
  const url = new URL(path.replace(/^\//, ''), `${API_URL}/`);
  const res = await fetch(url, {
    headers: { 'x-user-id': getCurrentUserId() },
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    const parsed = text ? safeJson(text) : undefined;
    throw new ApiError(res.status, extractMessage(parsed) ?? res.statusText, parsed);
  }
  return res.arrayBuffer();
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
