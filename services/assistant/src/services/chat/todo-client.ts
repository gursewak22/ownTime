import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// HTTP client for the tools service's /todos surface (contracts/tools.openapi.yaml).
// Calls are made with the *user's* forwarded credentials — this service never
// holds a token of its own (ADR 0006: no shared secrets between services).

export type ForwardedAuth = Record<string, string>;

export type Todo = {
  id: string;
  title: string;
  notes: string | null;
  done: boolean;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class TodoClient {
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
      throw new Error(`tools service ${method} ${path} failed (${res.status})${text ? `: ${text}` : ''}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  list(auth: ForwardedAuth, done?: boolean): Promise<Todo[]> {
    const query = done === undefined ? '' : `?done=${done}`;
    return this.request<Todo[]>('GET', `/todos${query}`, auth);
  }

  create(
    auth: ForwardedAuth,
    input: { title: string; notes?: string; dueAt?: string },
  ): Promise<Todo> {
    return this.request<Todo>('POST', '/todos', auth, input);
  }

  update(
    auth: ForwardedAuth,
    id: string,
    patch: { title?: string; notes?: string; done?: boolean; dueAt?: string | null },
  ): Promise<Todo> {
    return this.request<Todo>('PATCH', `/todos/${id}`, auth, patch);
  }

  delete(auth: ForwardedAuth, id: string): Promise<void> {
    return this.request<void>('DELETE', `/todos/${id}`, auth);
  }
}
