import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForwardedAuth } from './todo-client';

// HTTP client for the tools service's /scribe surface (contracts/tools.openapi.yaml).
// Like TodoClient, every call carries the *user's* forwarded credentials — this
// service holds no token of its own (ADR 0006: no shared secrets between services).

/** TipTap/ProseMirror document JSON, stored verbatim by the tools service. */
export type TiptapDoc = { type: 'doc'; content: unknown[] };

export type ScribeNoteSummary = {
  id: string;
  title: string;
  pdfName: string | null;
  updatedAt: string;
};

export type ScribeNoteDetail = ScribeNoteSummary & {
  doc: TiptapDoc;
  strokes: unknown[];
  comments: unknown[];
  createdAt: string;
};

@Injectable()
export class ScribeClient {
  constructor(private readonly config: ConfigService) {}

  private base(): string {
    return this.config.get<string>('TOOLS_URL') ?? 'http://localhost:3002';
  }

  private async request<T>(
    method: string,
    path: string,
    auth: ForwardedAuth,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.base()}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...auth },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `tools service ${method} ${path} failed (${res.status})${text ? `: ${text}` : ''}`,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  list(auth: ForwardedAuth): Promise<ScribeNoteSummary[]> {
    return this.request<ScribeNoteSummary[]>('GET', '/scribe/notes', auth);
  }

  get(auth: ForwardedAuth, id: string): Promise<ScribeNoteDetail> {
    return this.request<ScribeNoteDetail>('GET', `/scribe/notes/${id}`, auth);
  }

  create(auth: ForwardedAuth, title?: string): Promise<ScribeNoteDetail> {
    return this.request<ScribeNoteDetail>('POST', '/scribe/notes', auth, title ? { title } : {});
  }

  update(
    auth: ForwardedAuth,
    id: string,
    patch: { title?: string; doc?: TiptapDoc },
  ): Promise<ScribeNoteSummary> {
    return this.request<ScribeNoteSummary>('PATCH', `/scribe/notes/${id}`, auth, patch);
  }
}
