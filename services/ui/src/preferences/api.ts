import { api } from '@/lib/api-client';

export const preferencesApi = {
  list: (service: string) => api<Record<string, unknown>>(`/preferences/${service}`),
  get: <T = unknown>(service: string, key: string) =>
    api<{ value: T | null }>(`/preferences/${service}/${key}`),
  set: (service: string, key: string, value: unknown) =>
    api<{ ok: true }>(`/preferences/${service}/${key}`, {
      method: 'PUT',
      body: { value },
    }),
};
