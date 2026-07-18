import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDeleteProvider, useProviderStatus, useSetProvider } from '../hooks';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/**
 * Configure which model the agent talks to. Hosted Anthropic = paste an API
 * key and leave the endpoint empty. Local/other models = point the endpoint at
 * any Anthropic-format server (Ollama, or a LiteLLM proxy for Gemini/OpenAI)
 * and name the model.
 */
export function ProviderSettings({ onSaved }: { onSaved?: () => void }) {
  const status = useProviderStatus();
  const setProvider = useSetProvider();
  const deleteProvider = useDeleteProvider();
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  // Pre-fill the non-secret fields from the saved config.
  useEffect(() => {
    if (status.data) {
      setBaseUrl(status.data.baseUrl ?? '');
      setModel(status.data.model ?? '');
    }
  }, [status.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setProvider.mutate(
      {
        // Omitted key = keep the one already stored server-side.
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
      },
      {
        onSuccess: () => {
          setApiKey('');
          onSaved?.();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted">
        Use Anthropic's API (paste a key, leave the endpoint empty) or any
        Anthropic-format endpoint — e.g. local Ollama at{' '}
        <span className="font-mono">http://localhost:11434</span>, or a LiteLLM proxy for
        Gemini/OpenAI. Keys are encrypted before they're stored and never sent back to the
        browser.
      </p>

      <label className="block space-y-1 text-xs text-muted">
        API key {status.data?.hint ? <span className="font-mono">(saved: {status.data.hint})</span> : '(optional for local endpoints)'}
        <Input
          type="password"
          placeholder={status.data?.hint ? 'leave empty to keep the saved key' : 'sk-ant-…'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </label>

      <div className="flex gap-2">
        <label className="block flex-1 space-y-1 text-xs text-muted">
          Endpoint (empty = Anthropic)
          <Input
            type="text"
            placeholder="http://localhost:11434"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="block flex-1 space-y-1 text-xs text-muted">
          Model (empty = default)
          <Input
            type="text"
            placeholder="claude-opus-4-8 / qwen3"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={setProvider.isPending || (!apiKey.trim() && !baseUrl.trim() && !status.data?.hint)}
        >
          {setProvider.isPending ? 'Saving…' : 'Save'}
        </Button>
        {status.data?.configured && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => deleteProvider.mutate()}
            disabled={deleteProvider.isPending}
          >
            Reset
          </Button>
        )}
      </div>

      {setProvider.isError && <p className="text-xs text-danger">{errorText(setProvider.error)}</p>}
    </form>
  );
}
