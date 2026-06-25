# ADR 0004: Desktop shell (Electron) for a real browser view

- Status: Accepted
- Date: 2026-06-25
- Deciders: gursewak22 (with Claude Code)
- Relates to: the `web` service (added to the frontend service registry)

## Context

The product wants a **Web** service: a panel that opens a website and works
like a normal browser tab. In the web client (`webBrowser/frontend`, a browser
SPA) the only way to embed another site is an `<iframe>`, and most major sites
(Google, YouTube, X, GitHub, banks…) send `X-Frame-Options` / CSP
`frame-ancestors` headers that forbid framing. The browser enforces these on the
remote site's behalf; **no client-side code can override them**. So the iframe
version can only ever load embeddable sites.

Real "browser-level" embedding requires leaving the browser sandbox: a runtime
that ships its own Chromium and exposes an embeddable web view those headers
don't restrict.

We considered three paths (see ADR 0003-era "iframe mini-browser", and):

1. **Backend reverse proxy** that strips frame-blocking headers. Rejected:
   breaks on JS-heavy SPAs, logins, and relative URLs; turns the backend into an
   open proxy (SSRF) on a server already documented as "not safe to expose".
2. **Electron desktop shell** with `<webview>`. Chosen.
3. **Tauri** (system webview). Viable and lighter, but the system webview is
   less consistent across OSes and `<webview>`-style embedding is less mature;
   revisit if app size becomes a priority.

## Decision summary

| #  | Area                  | Decision                                                                 |
|----|-----------------------|--------------------------------------------------------------------------|
| 1  | Desktop runtime       | Electron, as a new top-level `desktop/` sub-project                       |
| 2  | Frontend reuse        | The shell loads the existing `webBrowser/frontend` unchanged              |
| 3  | Embedding primitive   | Electron `<webview>` (DOM-embeddable, fits inside a panel)                |
| 4  | Runtime detection     | Preload exposes `window.ownTimeDesktop`; `src/lib/desktop.ts#isDesktop()` |
| 5  | Web service branching | `WebPanel` renders `<webview>` on desktop, `<iframe>` in the browser      |
| 6  | Renderer hardening     | `contextIsolation: true`, `nodeIntegration: false`, minimal preload      |
| 7  | Dev model             | Shell points at the Vite dev server (`OWNTIME_DEV_URL`)                   |
| 8  | Packaging             | Out of scope for now (follow-up: electron-builder + Vite `base: './'`)    |

## Decisions in detail

### 1–3. Electron + `<webview>`, frontend reused as-is

The desktop app is a thin wrapper: `desktop/main.js` creates a `BrowserWindow`
and loads the same frontend the browser uses. The only capability it adds is
`webPreferences.webviewTag: true`, enabling `<webview>`. We chose `<webview>`
over `BrowserView`/`WebContentsView` because those are positioned from the main
process and float above the DOM — awkward to place inside a React-managed
resizable panel — whereas `<webview>` lives in the DOM and flows with the panel.

### 4–5. One service, two render paths

The frontend stays a single codebase. `isDesktop()` (preload flag, with an
Electron-UA fallback) selects the path at runtime:

- **Desktop** → `WebviewBrowser` (`<webview>`): any site loads; in-page
  navigation and link clicks sync back to the address bar via webview lifecycle
  events; nav buttons drive the webview's own history; a persistent
  `partition` keeps logins/cookies.
- **Browser** → `IframeBrowser` (`<iframe>`): embeddable sites only, with an
  "Open in new tab" affordance for blocked ones.

Both persist the panel's URL per user via the existing preferences store
(`service: 'web'`, `key: <panel instanceId>`) — no new backend.

### 6. Renderer stays locked down

`contextIsolation` on, `nodeIntegration` off, `sandbox: false` only as required
by `<webview>`. The preload exposes a single read-only flag via `contextBridge`
— no Node APIs reach page code. `setWindowOpenHandler` routes real
`window.open`/target=_blank to the OS browser.

## Consequences

- **Positive:** the Web service becomes a true browser tab in the desktop build,
  with zero changes to the backend or the rest of the frontend.
- **Negative:** a new toolchain and a large (~100MB+) Chromium-bearing artifact;
  the browser build remains iframe-limited (acceptable — the two builds degrade
  gracefully).
- The backend remains untouched, so its "not safe to expose" status and the
  `x-user-id` auth seam are unaffected.

## Revisit triggers

- **App size / footprint matters** → evaluate Tauri (system webview).
- **Need to ship installers** → add electron-builder and set Vite `base: './'`
  so `index.html` loads under `file://`.
- **Web (browser) parity becomes important** → reconsider a scoped, hardened
  proxy for a known allow-list of sites, or drop the iframe path.
