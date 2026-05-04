import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { usePreference } from '@/preferences/use-preference';
import type { Todo } from '../api';
import { CreateTodoForm } from '../components/CreateTodoForm';
import { TodoItem } from '../components/TodoItem';
import { useDeleteTodo, useTodos, useUpdateTodo } from '../hooks';

type SortKey = 'createdAt' | 'title';

export function TodoListPage(_props: { instanceId: string }) {
  const todos = useTodos();
  const update = useUpdateTodo();
  const remove = useDeleteTodo();
  const sortPref = usePreference<SortKey>('todo', 'defaultSort', 'createdAt');

  const sorted = useMemo(() => {
    const list = todos.data ?? [];
    return [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (sortPref.value === 'title') return a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [todos.data, sortPref.value]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          sort
          <Select
            value={sortPref.value ?? 'createdAt'}
            onChange={(e) => sortPref.setValue(e.target.value as SortKey)}
            disabled={sortPref.isLoading}
          >
            <option value="createdAt">Newest first</option>
            <option value="title">By title</option>
          </Select>
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTodoForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Items {sorted.length ? <span className="ml-1 text-xs font-normal text-muted">({sorted.length})</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todos.isLoading && <div className="py-6 text-center text-sm text-muted">Loading…</div>}
          {todos.isError && (
            <div className="py-6 text-center text-sm text-danger">
              Couldn't reach the backend. Is it running on the configured VITE_API_URL?
            </div>
          )}
          {todos.data && sorted.length === 0 && (
            <div className="py-6 text-center text-sm text-muted">Nothing yet — add one above.</div>
          )}
          {sorted.length > 0 && (
            <ul>
              {sorted.map((t: Todo) => (
                <TodoItem
                  key={t.id}
                  todo={t}
                  onToggle={(todo) =>
                    update.mutate({ id: todo.id, input: { done: !todo.done } })
                  }
                  onDelete={(todo) => remove.mutate(todo.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
