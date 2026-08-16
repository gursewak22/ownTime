import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { KeyRound, ListChecks, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { ChatMessage } from '../api';
import { ProviderSettings } from '../components/ProviderSettings';
import { useChatHistory, useClearChat, useProviderStatus, useSendMessage } from '../hooks';

const QUICK_PROMPT =
  'Look at my open todos and complete every task you can genuinely finish yourself. Show me the work, mark those done, and tell me which ones you skipped and why.';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <li className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
          isUser ? 'bg-accent text-accent-fg' : 'border border-border bg-bg',
        )}
      >
        {message.content}
      </div>
      {message.actions.length > 0 && (
        <ul className="flex max-w-[85%] flex-wrap gap-1">
          {message.actions.map((action, i) => (
            <li
              key={i}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted"
              title={action.tool}
            >
              {action.detail}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function AssistantPanel(_props: { instanceId: string }) {
  const providerStatus = useProviderStatus();
  const history = useChatHistory();
  const send = useSendMessage();
  const clear = useClearChat();
  const [draft, setDraft] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = history.data ?? [];
  const configured = providerStatus.data?.configured ?? false;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, send.isPending]);

  const submit = (text?: string) => {
    const message = (text ?? draft).trim();
    if (!message || send.isPending) return;
    setDraft('');
    send.mutate(message);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {(showSettings || (!configured && !providerStatus.isLoading)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Model</CardTitle>
          </CardHeader>
          <CardContent>
            <ProviderSettings onSaved={() => setShowSettings(false)} />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => submit(QUICK_PROMPT)}
          disabled={!configured || send.isPending}
          title="Ask the assistant to work through your open todos"
        >
          <ListChecks className="mr-1 h-4 w-4" />
          Complete feasible tasks
        </Button>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings((v) => !v)}
            title="Model settings"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => clear.mutate()}
            disabled={clear.isPending || messages.length === 0}
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border p-3">
        {history.isLoading && (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        )}
        {!history.isLoading && messages.length === 0 && (
          <div className="py-6 text-center text-sm text-muted">
            {configured
              ? 'Ask me to work through your todo list — I\'ll do what I can and tell you what I skipped.'
              : 'Configure a model above to get started — an Anthropic API key, or a local endpoint like Ollama.'}
          </div>
        )}
        {messages.length > 0 && (
          <ul className="space-y-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </ul>
        )}
        {send.isPending && (
          <div className="py-3 text-center text-xs text-muted">
            Assistant is working on your list…
          </div>
        )}
        {send.isError && (
          <div className="py-2 text-center text-xs text-danger">{errorText(send.error)}</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2">
        <textarea
          className={cn(
            'min-h-[2.5rem] w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          )}
          rows={2}
          placeholder={configured ? 'Message the assistant…' : 'Configure a model first'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!configured || send.isPending}
        />
        <Button
          type="button"
          onClick={() => submit()}
          disabled={!configured || send.isPending || !draft.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
