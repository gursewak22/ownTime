import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePreference } from '@/preferences/use-preference';
import type { PanelComponentProps } from '../registry';
import { BrowserEmptyState, BrowserToolbar } from './BrowserToolbar';
import { normalizeUrl } from './url';

/**
 * Browser fallback: an <iframe> mini-browser. Loads sites that allow embedding;
 * blocked sites show a link to open in a real tab. Back/forward is a session
 * history of URLs entered in the bar (the iframe's own history is cross-origin
 * and not observable).
 */
export function IframeBrowser({ instanceId }: PanelComponentProps) {
  const stored = usePreference<string>('web', instanceId, '');
  const [history, setHistory] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [address, setAddress] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const hydrated = useRef(false);

  const current = index >= 0 ? history[index] : '';

  useEffect(() => {
    if (hydrated.current || stored.isLoading) return;
    hydrated.current = true;
    if (stored.value) {
      setHistory([stored.value]);
      setIndex(0);
      setAddress(stored.value);
    }
  }, [stored.isLoading, stored.value]);

  function go(raw: string) {
    const url = normalizeUrl(raw);
    if (!url) return;
    setHistory((h) => [...h.slice(0, index + 1), url]);
    setIndex((i) => i + 1);
    setAddress(url);
    setLoading(true);
    stored.setValue(url);
  }

  function goTo(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= history.length) return;
    const url = history[nextIndex];
    setIndex(nextIndex);
    setAddress(url);
    setLoading(true);
    stored.setValue(url);
  }

  return (
    <div className="flex h-full flex-col">
      <BrowserToolbar
        address={address}
        onAddressChange={setAddress}
        onSubmit={() => go(address)}
        onBack={() => goTo(index - 1)}
        onForward={() => goTo(index + 1)}
        onReload={() => {
          if (!current) return;
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
        onOpenExternal={() => current && window.open(current, '_blank', 'noopener,noreferrer')}
        canBack={index > 0}
        canForward={index < history.length - 1}
        hasUrl={Boolean(current)}
      />

      <div className="relative min-h-0 flex-1 bg-muted/5">
        {current ? (
          <>
            <iframe
              key={`${reloadKey}:${current}`}
              src={current}
              title="Web"
              className="h-full w-full border-0 bg-white"
              onLoad={() => setLoading(false)}
              referrerPolicy="no-referrer"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
            {loading && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
                <div className="h-full w-1/3 animate-pulse bg-accent" />
              </div>
            )}
            <a
              href={current}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-border bg-bg/90 px-2.5 py-1 text-[11px] text-muted shadow-sm backdrop-blur hover:text-fg"
              title="Some sites block embedding — open it in a real browser tab"
            >
              <ExternalLink className="h-3 w-3" />
              Blank? Open in new tab
            </a>
          </>
        ) : (
          <BrowserEmptyState desktop={false} />
        )}
      </div>
    </div>
  );
}
