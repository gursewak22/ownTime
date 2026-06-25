/**
 * True when running inside the ownTime Electron shell. The shell's preload
 * exposes `window.ownTimeDesktop`; we also fall back to the Electron UA so it
 * works even if the preload changes. In a normal browser this is false and the
 * Web service uses an <iframe>.
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  const flag = (window as { ownTimeDesktop?: { isDesktop?: boolean } }).ownTimeDesktop;
  if (flag?.isDesktop) return true;
  return typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
}
