/**
 * Turn whatever the user typed into a loadable URL. Adds https:// when no scheme
 * is present. Returns '' for blank input.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed; // already has a scheme
  return `https://${trimmed}`;
}

/** Short host label for display (e.g. "example.com"), falling back to the raw url. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
