import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/lib/user-store';
import { todoApi, type CreateTodoInput, type Todo, type UpdateTodoInput } from './api';

function listKey(userId: string) {
  return ['todos', userId] as const;
}

export function useTodos() {
  const userId = useUserStore((s) => s.currentUserId);
  return useQuery({
    queryKey: listKey(userId),
    queryFn: () => todoApi.list(),
  });
}

export function useCreateTodo() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTodoInput) => todoApi.create(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: listKey(userId) }),
  });
}

export function useUpdateTodo() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTodoInput }) =>
      todoApi.update(id, input),
    onMutate: async ({ id, input }) => {
      const key = listKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Todo[]>(key);
      if (previous) {
        queryClient.setQueryData<Todo[]>(
          key,
          previous.map((t) => (t.id === id ? { ...t, ...input } as Todo : t)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey(userId), ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey(userId) }),
  });
}

export function useDeleteTodo() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => todoApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: listKey(userId) }),
  });
}
