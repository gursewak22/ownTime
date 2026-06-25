import { isDesktop } from '@/lib/desktop';
import type { PanelComponentProps } from '../registry';
import { IframeBrowser } from './IframeBrowser';
import { WebviewBrowser } from './WebviewBrowser';

/**
 * Web service panel. Inside the Electron desktop shell it renders a real
 * <webview> (any site, like a normal tab); in a plain browser it falls back to
 * an <iframe> (embeddable sites only). See docs/adr/0004.
 */
export function WebPanel(props: PanelComponentProps) {
  return isDesktop() ? <WebviewBrowser {...props} /> : <IframeBrowser {...props} />;
}
