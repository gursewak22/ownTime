# ownTime desktop shell (Electron)

Thin Electron wrapper around `webBrowser/frontend`. Its reason to exist: the
**Web** service. In a browser the Web panel can only use an `<iframe>`, which
most sites block via `X-Frame-Options` / CSP `frame-ancestors`. Inside Electron
the same panel renders a real Chromium `<webview>`, which those headers don't
restrict — so any site loads, with working logins and cookies, like a normal
browser tab.

## Run (dev)

Two terminals:

```bash
# 1. frontend dev server (from webBrowser/frontend)
npm run dev            # http://localhost:5173

# 2. backend (from webBrowser/backend) — needed for data
npm run start:dev      # http://localhost:3000

# 3. desktop shell (from desktop/)
npm install            # first time (downloads Electron)
npm run dev            # opens the app pointing at the dev server
```

Point the shell at a different frontend URL with `OWNTIME_DEV_URL`.

## How it works

- `main.js` — creates the window. `webviewTag: true` enables `<webview>`;
  `contextIsolation: true` + `nodeIntegration: false` keep the renderer locked
  down. `setWindowOpenHandler` sends real `window.open` calls to the OS browser.
- `preload.js` — exposes `window.ownTimeDesktop = { isDesktop: true }` so the
  frontend can detect the desktop runtime (`src/lib/desktop.ts`).
- The frontend is unchanged except that the Web service swaps `<iframe>` for
  `<webview>` when `isDesktop()` is true.

## Packaging (not yet wired)

Production packaging (electron-builder → .dmg/.exe) is a follow-up. It will also
need Vite `base: './'` so the built `index.html` loads under `file://`. For now
the shell targets the dev server.
