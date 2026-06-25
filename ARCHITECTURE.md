# Architecture

This document describes the **system-level architecture** of ownTime: how the
sub-projects fit together, the shared infrastructure, and the seams that
individual services plug into.

It intentionally does **not** document any individual service's internals
(todo, clock, …). Each service owns its own behavior and may carry its own
docs. This file covers only what is common to all of them.

> For the *why* behind these choices, see the ADRs in `docs/adr/`
> (0001 backend, 0002 frontend, 0003 workspace shell).

---

## 1. Big picture

ownTime is a single productivity workspace. The user stays in one screen and
composes the tools they need as **resizable panels** rather than navigating
between pages. Each tool is a self-contained **service**.

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                          │
│  webBrowser/frontend  — Vite + React + TS                      │
│                                                                │
│   WorkspaceShell ── workspace tree of resizable panels         │
│        │                                                       │
│        ├─ service registry (todo, clock, …)                    │
│        └─ api-client  ── sends  x-user-id  on every request    │
└───────────────────────────────┬──────────────────────────────┘
                                 │ HTTP (JSON), CORS-restricted
                                 │ header: x-user-id
┌───────────────────────────────▼──────────────────────────────┐
│  webBrowser/backend   — NestJS modular monolith                │
│                                                                │
│   main.ts ─ global ValidationPipe + CORS                       │
│   app.module ─ registers one module per service                │
│        │                                                       │
│        ├─ common/  PrismaModule (@Global) + @CurrentUser seam  │
│        ├─ preferences/  generic per-user K/V store             │
│        └─ services/<name>/  one module each                    │
└───────────────────────────────┬──────────────────────────────┘
                                 │ Prisma ORM
┌───────────────────────────────▼──────────────────────────────┐
│  PostgreSQL  (Docker Compose, local dev)                       │
│  User · Preference · <per-service tables>                      │
└──────────────────────────────────────────────────────────────┘
```

### Sub-projects

| Path | Status | Stack |
|------|--------|-------|
| `webBrowser/backend/` | active | TypeScript · NestJS · Prisma · PostgreSQL |
| `webBrowser/frontend/` | active | Vite · React 18 · TS · Tailwind v3 · TanStack Query · Zustand · react-resizable-panels |
| `mobile/` | empty | not yet chosen |
| `docs/adr/` | active | Architecture Decision Records |

Each is a **separate sub-project with its own toolchain**. The `webBrowser/`
name is intentional (not `web/`).

---

## 2. Cross-cutting concepts

These three ideas show up on both sides of the wire and define how the whole
system hangs together.

### 2.1 Users and the auth seam (deferred auth)

There is **no real authentication yet**. Identity is carried end-to-end as a
single `x-user-id` HTTP header.

- **Frontend** — the current user lives in a Zustand store
  (`lib/user-store.ts`, persisted to localStorage). Every request goes through
  `lib/api-client.ts`, the **one place** that attaches `x-user-id`.
- **Backend** — every controller reads the id via the `@CurrentUser()`
  decorator (`common/decorators/current-user.decorator.ts`), which pulls it
  from the header and rejects requests that lack it.

When real auth lands, only **two files** change: the frontend `api-client.ts`
and the backend `current-user.decorator.ts` (plus the `User` model). Service
code stays untouched.

> ⚠️ Because anyone can set `x-user-id`, the backend is **not safe to expose
> publicly** until auth is implemented.

### 2.2 Per-user isolation

Everything is scoped by user id, top to bottom:

- Backend queries are always filtered by `userId`; every domain table carries a
  `userId` column with a `User` relation and `onDelete: Cascade`.
- Frontend server-state (TanStack Query) keys include `userId`, so switching
  users in the header transparently reloads that user's data and layout — no
  special code path.

### 2.3 Preferences: one generic store for everyone

Any per-user setting — including the workspace layout itself — goes through a
single generic key/value store instead of bespoke columns.

- **DB:** the `Preference` table is `(userId, service, key) → value (JSONB)`
  with a unique constraint on the triple. Adding a new preference key requires
  **zero schema changes**.
- **Backend:** `PreferencesService.get/set/list/delete(userId, service, key)`,
  exposed at `/preferences/:service/:key`.
- **Frontend:** the `usePreference<T>(service, key, default)` hook
  (`preferences/use-preference.ts`) wraps it with optimistic updates and
  per-user cache keys.

The `service` field namespaces preferences. The workspace shell is *just
another namespace* (`service: 'shell'`) — it has no privileged path.

---

## 3. Backend architecture

A **modular monolith**. The guiding rule: *adding a new service must not touch
existing services.*

```
src/
├── main.ts            bootstrap: global ValidationPipe, CORS (allows x-user-id)
├── app.module.ts      registers every module — one import line per service
├── common/
│   ├── prisma/        @Global() PrismaModule + PrismaService
│   └── decorators/    current-user.decorator.ts  ← the auth seam
├── preferences/       generic (userId, service, key, JSONB) store
└── services/
    └── <name>/        one module per service (controller + service + dto/)
```

**Isolation rules (enforced by convention):**

- Services never import another service's `*.service.ts` directly. If service A
  needs B's data, B exports a provider and A adds B's *module* to its `imports`.
- Services never query another service's tables via Prisma.
- All DTOs use `class-validator`; nothing bypasses the global `ValidationPipe`.

**Data layer:** Prisma over PostgreSQL. `PrismaModule` is `@Global`, so any
service can inject `PrismaService` without re-importing it. The dev database
runs in Docker Compose.

---

## 4. Frontend architecture

A **single-route SPA** hosting a workspace of resizable panels. There is **no
per-service URL** — every service lives inside a panel inside the workspace
tree.

```
src/
├── main.tsx           QueryClientProvider + StrictMode mount
├── App.tsx            mounts <WorkspaceShell />
├── lib/
│   ├── api-client.ts  fetch wrapper; injects x-user-id  ← the auth seam
│   ├── user-store.ts  Zustand store (persisted)
│   └── cn.ts          clsx + tailwind-merge helper
├── components/
│   ├── ui/            hand-rolled shadcn-style primitives
│   └── shell/         UserSwitcher
├── preferences/       /preferences client + usePreference() hook
├── services/
│   ├── registry.ts    export const services: ServiceModule[]
│   └── <name>/        one folder per service
└── workspace/         the shell that hosts panels (see §5)
```

**State model:**

- **Server state** → TanStack Query, keyed by `userId`.
- **User-switcher state** → Zustand (`user-store`), persisted to localStorage.
- **Workspace layout** → a preference (`service:'shell', key:'layout'`),
  fetched/persisted via `usePreference`.

---

## 5. The workspace shell

The shell is what turns a flat list of services into a composable workspace. It
is a **recursive tree of panels**, persisted per user.

**Layout model** (`workspace/types.ts`):

```ts
type LeafNode  = { type:'leaf';  id; serviceId };
type SplitNode = { type:'split'; id; direction:'horizontal'|'vertical';
                   children: LayoutNode[]; sizes: number[] };
type LayoutNode = LeafNode | SplitNode;
```

- **Leaves** render a service's panel; **splits** arrange children with sizes.
- `workspace/layout-ops.ts` holds the pure tree operations (append, split,
  remove, resize, validate, prune unknown services, enforce singletons).
- `Workspace.tsx` renders the tree recursively with `react-resizable-panels`;
  `PanelFrame.tsx` provides panel chrome (header + close) and wraps content in
  `overflow-auto`.
- `use-workspace-layout.ts` owns the in-memory tree, **hydrates** it from the
  `shell/layout` preference (validating, pruning services that no longer exist,
  and de-duplicating singletons), and **persists** changes back debounced.

Because the layout is stored as the `shell/layout` preference, it follows the
same per-user isolation as any service — switching users reloads their layout
automatically.

---

## 6. The service contract (the extension seam)

This is the boundary new services implement. Internals beyond this contract are
each service's own concern.

**Backend** — a service is a NestJS module under `src/services/<name>/`,
registered with one line in `app.module.ts`. It owns its Prisma model(s)
(always with `userId` + `User` relation), scopes every query by
`@CurrentUser()`, and uses `PreferencesService` for any per-user settings.

**Frontend** — a service exports a `ServiceModule` from its `index.tsx` and is
listed in `services/registry.ts`:

```ts
type ServiceModule = {
  id: string;                              // matches backend `service` namespace
  label: string;                           // shown in menus + panel header
  icon: LucideIcon;
  panelComponent: ComponentType<PanelComponentProps>;  // rendered inside a panel
  singleton?: boolean;                     // at most one panel of this service
};
```

`PanelComponentProps` gives each panel a stable `instanceId` (the leaf node id)
for scoping panel-local preferences. There is no `routes` field — **services
don't own URLs**. The Add-panel and Split menus are sourced automatically from
the registry.

**Hard rules:** services don't import each other; services don't read or write
another service's preference namespace.

> Step-by-step recipes for adding a service (backend and frontend) live in
> `CLAUDE.md`.

---

## 7. Request lifecycle (example)

A typical write, end to end:

1. A panel component calls a service hook → `lib/api-client.ts`.
2. `api-client` issues `fetch` with `content-type: application/json` and
   `x-user-id: <current user>`.
3. NestJS validates the DTO (global `ValidationPipe`), resolves the user via
   `@CurrentUser()`, and the service executes a Prisma query **scoped to that
   userId**.
4. The response flows back; TanStack Query caches it under a `userId`-keyed key.
5. Switching users in the header changes the cache key → the UI shows the new
   user's data and workspace layout.

---

## 8. Boundaries to respect

- Keep the auth seam to its two files (`api-client.ts`, `current-user.decorator.ts`).
- Don't add columns for preferences — use the `Preference` store.
- Keep services isolated: no cross-service imports, table access, or preference
  namespaces.
- Read the relevant ADR before changing a foundation:
  - Backend foundations (DB/ORM/framework/auth/isolation) → **ADR 0001**.
  - Frontend foundations (build tool/framework/panel lib) → **ADR 0002**.
  - How panels work (registry contract, persistence, splits) → **ADR 0003**.
