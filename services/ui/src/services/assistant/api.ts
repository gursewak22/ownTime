import { api } from '@/lib/api-client';

export type ProviderStatus = {
  configured: boolean;
  hint: string | null;
  baseUrl: string | null;
  model: string | null;
};

export type SetProviderInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type AgentAction = { tool: string; detail: string };

export type ChatMessage = {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  actions: AgentAction[];
  createdAt: string;
};

export const assistantApi = {
  providerStatus: () => api<ProviderStatus>('/assistant/provider'),
  setProvider: (input: SetProviderInput) =>
    api<ProviderStatus>('/assistant/provider', { method: 'PUT', body: input }),
  deleteProvider: () => api<{ ok: boolean }>('/assistant/provider', { method: 'DELETE' }),
  history: () => api<ChatMessage[]>('/assistant/chat'),
  send: (message: string) =>
    api<{ messages: ChatMessage[] }>('/assistant/chat', {
      method: 'POST',
      body: { message },
    }),
  clear: () => api<{ ok: boolean }>('/assistant/chat', { method: 'DELETE' }),
};
