# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ownTime is a productivity tool intended to keep the user on a single task instead of switching between applications (per `README.md`). It hosts multiple in-app services (todo first, more later); each can have its own data and per-user preferences. The web client renders services as resizable panels in a single workspace, not a sidebar+page navigation.

## Repo layout

| Path | Status | Notes |
|------|--------|-------|
| `webBrowser/backend/` | **active** | NestJS + Prisma + Postgres. |
| `webBrowser/frontend/` | **active** | Vite + React + TS workspace shell with resizable panels. |
| `desktop/` | **active** | Electron shell that loads the frontend; gives the Web service a real `<webview>`. See ADR 0004. |
| `mobile/` | empty | Mobile client, stack not yet chosen. |
| `docs/adr/` | active | Architecture Decision Records. **Read 0001 before changing the backend; 0002+0003 before changing the frontend; 0004 before changing the desktop shell.** |

Treat the top-level areas as separate sub-projects with their own toolchains.

## Backend (`webBrowser/backend/`)

**Stack:** TypeScript + NestJS, Prisma ORM, PostgreSQL (Docker Compose for local dev). Architectural decisions (and why we rejected Rust/Go/Express/microservices) live in `docs/adr/0001-web-backend-initial-stack.md` — consult it before proposing alternatives.

### One-time setup

```bash
cd webBrowser/backend
cp .env.example .env
docker compose up -d              # Postgres on :5432
npm install
npx prisma migrate dev            # also runs `prisma generate`
```

### Daily commands (run from `webBrowser/backend/`)

| Command | What it does |
|---|---|
| `npm run start:dev` | NestJS in watch mode on `http://localhost:3000` |
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | `tsc --noEmit` — fast type check, no emit |
| `npx prisma migrate dev --name <name>` | Create + apply a new migration |
| `npx prisma generate` | Regenerate the Prisma client (after schema edits) |
| `npx prisma studio` | DB browser UI |
| `docker compose down` / `docker compose down -v` | Stop / nuke the dev DB |

There is no test harness yet — smoke tests are curl-based against a running server.

### Architecture (the part that matters when adding code)

This is a **modular monolith**. The whole point of the structure is that **adding a new service should not touch existing services**.

```
src/
├── main.ts                 ← bootstrap, global ValidationPipe, CORS (allows x-user-id)
├── app.module.ts           ← registers every service module (one line per module)
├── common/
│   ├── prisma/             ← @Global() PrismaModule + PrismaService
│   └── decorators/
│       └── current-user.decorator.ts   ← reads x-user-id header (THE auth seam)
├── preferences/            ← generic (userId, service, key, JSONB value) store
└── services/
    └── todo/               ← reference implementation; clone its shape for new services
```

**Auth is deferred.** Every controller takes `userId` from `@CurrentUser()`, which currently reads the `x-user-id` request header. When real auth lands, only that decorator's body and the `User` Prisma model change — service code stays put. The backend is **not safe to expose publicly** until that swap happens.

**Per-user preferences for any service** go through `PreferencesService.get/set(userId, service, key, value)`. The `Preference` table has a `(userId, service, key)` unique constraint and a `Json` `value` column — adding a new preference key requires zero schema changes.

### Adding a new service (backend recipe)

1. `mkdir src/services/<name>` — create `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, and a `dto/` folder.
2. Add a Prisma model to `prisma/schema.prisma` (include `userId String` and a `User` relation), then `npx prisma migrate dev --name add_<name>`.
3. Add `<Name>Module` to the `imports` array in `src/app.module.ts`.
4. If the service needs preferences, inject `PreferencesService` and call `.get/.set` with `service: '<name>'`. **Do not add new columns for prefs.**
5. Use `@CurrentUser() userId: string` in every endpoint. Always scope DB queries by `userId`.

**Hard rules:**
- Services do **not** import each other's `*.service.ts` directly. If service A needs B's data, B exports a provider, A adds B's module to its `imports`.
- Services do **not** query another service's tables in Prisma.
- All DTOs use `class-validator` decorators. Don't bypass the global `ValidationPipe`.

## Frontend (`webBrowser/frontend/`)

**Stack:** Vite + React 18 + TypeScript, Tailwind v3, TanStack Query for server state, Zustand for the user-switcher store, `react-resizable-panels` v2 for the workspace layout. Foundational decisions in `docs/adr/0002-web-frontend-initial-stack.md`; the **workspace shell** (the part you actually see) is in `docs/adr/0003-workspace-shell-resizable-panels.md` — read 0003 before changing how panels are added/removed/persisted.

### One-time setup

```bash
cd webBrowser/frontend
cp .env.example .env              # VITE_API_URL=http://localhost:3000
npm install
```

### Daily commands (run from `webBrowser/frontend/`)

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | `tsc --noEmit` — fast type check |

The backend must be running for the UI to load data. CORS allows the Vite default origin; change `CORS_ORIGIN` in the backend's `.env` if you change the frontend port.

### Architecture (the part that matters when adding code)

The frontend is a **single-route SPA hosting a workspace of resizable panels**. There is no per-service URL — every service lives inside a panel inside the workspace tree.

```
src/
├── main.tsx                ← QueryClientProvider + StrictMode mount
├── App.tsx                 ← mounts <WorkspaceShell />
├── index.css               ← Tailwind layers + theme tokens (CSS vars)
├── lib/
│   ├── api-client.ts       ← fetch wrapper; injects x-user-id from user-store
│   ├── user-store.ts       ← Zustand store, persisted to localStorage
│   └── cn.ts               ← clsx + tailwind-merge helper
├── components/
│   ├── ui/                 ← hand-rolled shadcn-style primitives (Button, Input, …)
│   └── shell/
│       └── UserSwitcher.tsx
├── preferences/            ← /preferences/:service client + usePreference() hook
├── services/
│   ├── registry.ts         ← export const services: ServiceModule[]
│   └── todo/               ← reference implementation
│       ├── index.tsx       ← exports todoModule (panelElement)
│       ├── api.ts          ← typed client for /todos
│       ├── hooks.ts        ← TanStack Query hooks
│       ├── pages/
│       └── components/
└── workspace/
    ├── types.ts            ← LayoutNode = LeafNode | SplitNode (recursive)
    ├── layout-ops.ts       ← appendPanel, removeNode, updateSizes, isLayoutNode (guard)
    ├── PanelFrame.tsx      ← chrome around a leaf (header + close)
    ├── Workspace.tsx       ← recursive renderer using react-resizable-panels
    ├── AddPanelMenu.tsx    ← toolbar dropdown sourced from the registry
    ├── use-workspace-layout.ts  ← state + debounced persist via usePreference('shell','layout')
    └── WorkspaceShell.tsx  ← top-level layout (toolbar + workspace tree)
```

**The single auth seam is `lib/api-client.ts`.** It reads the current user id from `user-store` and sends it as `x-user-id` on every request. When real auth lands, only this file changes.

**The workspace layout is persisted per user**, via the same backend preferences endpoint any service uses (`/preferences/shell/layout`). Switching users in the header reloads their layout because TanStack Query keys include `userId`. This is the same isolation pattern the backend enforces — there is no special "shell" code path.

**Service registry contract** (`src/services/registry.ts`):

```ts
type ServiceModule = {
  id: string;          // matches the `service` field in backend preferences
  label: string;       // shown in the sidebar of the Add-panel menu and panel header
  icon: LucideIcon;
  panelElement: ReactNode;  // rendered inside a panel
};
```

There is no `routes` field. Services don't own URLs.

### Adding a new service (frontend recipe)

1. `mkdir src/services/<name>` — typical layout: `index.tsx` (the module), `api.ts`, `hooks.ts`, `pages/<Name>Panel.tsx`, optional `components/`.
2. Implement the panel element. The panel is given the full pane height; **internal padding/scroll is the service's responsibility** (`PanelFrame` already wraps the content in `overflow-auto`).
3. Export a `ServiceModule` from `index.tsx` with `panelElement: <YourPanel />`.
4. Add the module to the `services` array in `src/services/registry.ts`. The Add-panel menu picks it up automatically.
5. If the service needs persistent user prefs, use `usePreference<T>(serviceId, key, defaultValue)` from `@/preferences/use-preference`. Optimistic updates and per-user cache keys are wired in.

**Hard rules:**
- Services don't import each other.
- Services don't read or write another service's preferences (`service` namespace).
- Server state goes through TanStack Query, keyed by `userId` so user-switching invalidates correctly. Don't fetch inside `useEffect` if there's a hooks pattern that fits.

## When working here

- If asked to add code to `mobile/`, confirm the stack with the user first — it's still empty.
- Preserve the `webBrowser/` directory name (not `web/`); it's intentional.
- Before changing **backend** foundations (DB engine, ORM, framework, auth shape, isolation rules), read ADR 0001 and either follow its "Revisit triggers" or open a new ADR.
- Before changing **frontend** foundations (build tool, framework, panel library) read ADR 0002. Before changing **how panels work** (registry contract, persistence, splits-vs-tiles), read ADR 0003.
