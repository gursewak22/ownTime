import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreference } from '@/preferences/use-preference';
import type { PanelComponentProps } from '../registry';
import { BrowserEmptyState, BrowserToolbar } from './BrowserToolbar';
import { normalizeUrl } from './url';
import type { WebviewElement, WebviewNavigationEvent } from './webview';

/**
 * Desktop path: a real Chromium <webview>. Not bound by X-Frame-Options, so any
 * site loads with working logins/cookies — a normal browser tab. Navigation
 * (including in-page link clicks) is reflected back into the address bar via the
 * webview's lifecycle events; nav buttons drive the webview's own history.
 */
export function WebviewBrowser({ instanceId }: PanelComponentProps) {
  const stored = usePreference<string>('web', instanceId, '');
  const ref = useRef<WebviewElement | null>(null);

  const [src, setSrc] = useState(''); // initial URL the <webview> mounts with
  const [address, setAddress] = useState(''); // text in the bar / current url
  const [loading, setLoading] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const hydrated = useRef(false);

  // Seed from the persisted URL once it loads.
  useEffect(() => {
    if (hydrated.current || stored.isLoading) return;
    hydrated.current = true;
    if (stored.value) {
      setSrc(stored.value);
      setAddress(stored.value);
    }
  }, [stored.isLoading, stored.value]);

  const persist = stored.setValue;

  // Sync the bar + nav state from the webview's own navigation events.
  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;

    const syncNav = (e: Event) => {
      const url = (e as WebviewNavigationEvent).url ?? wv.getURL();
      if (url) {
        setAddress(url);
        persist(url);
      }
      setCanBack(wv.canGoBack());
      setCanForward(wv.canGoForward());
    };
    const startLoading = () => setLoading(true);
    const stopLoading = () => setLoading(false);

    wv.addEventListener('did-navigate', syncNav);
    wv.addEventListener('did-navigate-in-page', syncNav);
    wv.addEventListener('did-start-loading', startLoading);
    wv.addEventListener('did-stop-loading', stopLoading);
    return () => {
      wv.removeEventListener('did-navigate', syncNav);
      wv.removeEventListener('did-navigate-in-page', syncNav);
      wv.removeEventListener('did-start-loading', startLoading);
      wv.removeEventListener('did-stop-loading', stopLoading);
    };
    // Re-attach when the webview element first appears (src goes from '' to a URL).
  }, [persist, src]);

  const go = useCallback(
    (raw: string) => {
      const url = normalizeUrl(raw);
      if (!url) return;
      setAddress(url);
      if (ref.current && src) {
        void ref.current.loadURL(url);
      } else {
        setSrc(url); // first navigation mounts the webview with this src
      }
      persist(url);
    },
    [persist, src],
  );

  return (
    <div className="flex h-full flex-col">
      <BrowserToolbar
        address={address}
        onAddressChange={setAddress}
        onSubmit={() => go(address)}
        onBack={() => ref.current?.goBack()}
        onForward={() => ref.current?.goForward()}
        onReload={() => ref.current?.reload()}
        onOpenExternal={() => address && window.open(address, '_blank', 'noopener,noreferrer')}
        canBack={canBack}
        canForward={canForward}
        hasUrl={Boolean(src)}
      />

      <div className="relative min-h-0 flex-1 bg-muted/5">
        {src ? (
          <>
            <webview
              ref={(el) => {
                ref.current = el as unknown as WebviewElement | null;
              }}
              src={src}
              partition="persist:owntime-web"
              allowpopups={true}
              className="h-full w-full"
              style={{ display: 'inline-flex' }}
            />
            {loading && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
                <div className="h-full w-1/3 animate-pulse bg-accent" />
              </div>
            )}
          </>
        ) : (
          <BrowserEmptyState desktop />
        )}
      </div>
    </div>
  );
}
