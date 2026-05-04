import { api } from '@/lib/api-client';

export type Todo = {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  done: boolean;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTodoInput = {
  title: string;
  notes?: string;
  dueAt?: string;
};

export type UpdateTodoInput = Partial<{
  title: string;
  notes: string | null;
  done: boolean;
  dueAt: string | null;
}>;

export const todoApi = {
  list: (done?: boolean) =>
    api<Todo[]>('/todos', { query: { done } }),
  create: (input: CreateTodoInput) =>
    api<Todo>('/todos', { method: 'POST', body: input }),
  update: (id: string, input: UpdateTodoInput) =>
    api<Todo>(`/todos/${id}`, { method: 'PATCH', body: input }),
  delete: (id: string) => api<void>(`/todos/${id}`, { method: 'DELETE' }),
};
