import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/lib/user-store';
import { assistantApi, type ChatMessage, type SetProviderInput } from './api';

function providerKey(userId: string) {
  return ['assistant', 'provider', userId] as const;
}

function chatKey(userId: string) {
  return ['assistant', 'chat', userId] as const;
}

export function useProviderStatus() {
  const userId = useUserStore((s) => s.currentUserId);
  return useQuery({
    queryKey: providerKey(userId),
    queryFn: () => assistantApi.providerStatus(),
  });
}

export function useSetProvider() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetProviderInput) => assistantApi.setProvider(input),
    onSuccess: (status) => queryClient.setQueryData(providerKey(userId), status),
  });
}

export function useDeleteProvider() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => assistantApi.deleteProvider(),
    onSuccess: () =>
      queryClient.setQueryData(providerKey(userId), {
        configured: false,
        hint: null,
        baseUrl: null,
        model: null,
      }),
  });
}

export function useChatHistory() {
  const userId = useUserStore((s) => s.currentUserId);
  return useQuery({
    queryKey: chatKey(userId),
    queryFn: () => assistantApi.history(),
  });
}

export function useSendMessage() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => assistantApi.send(message),
    onSuccess: (res) => {
      queryClient.setQueryData<ChatMessage[]>(chatKey(userId), (old) => [
        ...(old ?? []),
        ...res.messages,
      ]);
      // The agent may have created/completed/deleted todos — refresh the todo panel.
      queryClient.invalidateQueries({ queryKey: ['todos', userId] });
    },
  });
}

export function useClearChat() {
  const userId = useUserStore((s) => s.currentUserId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => assistantApi.clear(),
    onSuccess: () => queryClient.setQueryData<ChatMessage[]>(chatKey(userId), []),
  });
}
