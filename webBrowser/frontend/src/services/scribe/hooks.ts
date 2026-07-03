import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/lib/user-store';
import {
  scribeApi,
  type ScribeNote,
  type ScribeNoteSummary,
  type UpdateNoteInput,
} from './api';

function listKey(userId: string) {
  return ['scribe-notes', userId] as const;
}

function noteKey(userId: string, id: string | null) {
  return ['scribe-note', userId, id] as const;
}

export function useScribeNotes() {
  const userId = useUserStore((s) => s.currentUserId);
  return useQuery({
    queryKey: listKey(userId),
    queryFn: () => scribeApi.list(),
  });
}

/**
 * Full note for the editor. The editor seeds from this once and owns the state
 * afterwards, so the query must never refetch underneath it.
 */
export function useScribeNote(id: string | null) {
  const userId = useUserStore((s) => s.currentUserId);
  return useQuery({
    queryKey: noteKey(userId, id),
    queryFn: () => scribeApi.get(id as string),
    enabled: id !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      // A 404 means the note was deleted elsewhere — don't retry into it.
      !(error instanceof Error && 'status' in error && error.status === 404) &&
      failureCount < 2,
  });
}

export function useCreateNote() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => scribeApi.create(title),
    onSuccess: (created) => {
      queryClient.setQueryData<ScribeNote>(noteKey(userId, created.id), created);
      // Prepend to the list cache immediately: panels resolve their open note
      // against this list, and a fresh note must be selectable before the
      // background refetch lands.
      queryClient.setQueryData<ScribeNoteSummary[]>(listKey(userId), (cur) => {
        const summary = { id: created.id, title: created.title, updatedAt: created.updatedAt };
        return cur ? [summary, ...cur] : [summary];
      });
      void queryClient.invalidateQueries({ queryKey: listKey(userId) });
    },
  });
}

export function useRenameNote() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      scribeApi.update(id, { title }),
    onMutate: async ({ id, title }) => {
      const key = listKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ScribeNoteSummary[]>(key);
      if (previous) {
        queryClient.setQueryData<ScribeNoteSummary[]>(
          key,
          previous.map((n) => (n.id === id ? { ...n, title } : n)),
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

export function useDeleteNote() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scribeApi.delete(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: noteKey(userId, id) });
      void queryClient.invalidateQueries({ queryKey: listKey(userId) });
    },
  });
}

/**
 * Autosave mutation. On success the caches are patched in place — no
 * invalidation, so the open editor is never refetched underneath.
 */
export function useSaveNote() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNoteInput }) =>
      scribeApi.update(id, input),
    onSuccess: (summary, { id, input }) => {
      queryClient.setQueryData<ScribeNote>(noteKey(userId, id), (cur) =>
        cur ? { ...cur, ...input, updatedAt: summary.updatedAt } : cur,
      );
      queryClient.setQueryData<ScribeNoteSummary[]>(listKey(userId), (cur) =>
        cur?.map((n) => (n.id === id ? { ...n, updatedAt: summary.updatedAt } : n)),
      );
    },
  });
}
