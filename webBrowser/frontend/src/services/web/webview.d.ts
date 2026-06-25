/**
 * Minimal typing for Electron's <webview> element — only the members the Web
 * service uses. The `webview` JSX element itself is already declared by
 * @types/react (WebViewHTMLAttributes); we only add the imperative methods/event
 * shape, since React types it as a bare HTMLElement. The frontend has no
 * dependency on electron types, so we declare just enough here.
 * See https://www.electronjs.org/docs/latest/api/webview-tag
 */
export interface WebviewElement extends HTMLElement {
  src: string;
  getURL(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  loadURL(url: string): Promise<void>;
}

/** Event fired by webview navigation lifecycle events (did-navigate, etc.). */
export interface WebviewNavigationEvent extends Event {
  url: string;
}
