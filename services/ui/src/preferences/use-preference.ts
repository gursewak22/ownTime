import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/lib/user-store';
import { preferencesApi } from './api';

type UsePreferenceResult<T> = {
  value: T | undefined;
  isLoading: boolean;
  setValue: (next: T) => void;
  isSaving: boolean;
};

export function usePreference<T>(
  service: string,
  key: string,
  defaultValue: T,
): UsePreferenceResult<T> {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  const queryKey = ['preference', userId, service, key] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => preferencesApi.get<T>(service, key),
  });

  const mutation = useMutation({
    mutationFn: (next: T) => preferencesApi.set(service, key, next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ value: T | null }>(queryKey);
      queryClient.setQueryData(queryKey, { value: next });
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const value = query.data?.value ?? undefined;

  return {
    value: value === undefined ? defaultValue : value,
    isLoading: query.isLoading,
    setValue: (next: T) => mutation.mutate(next),
    isSaving: mutation.isPending,
  };
}
