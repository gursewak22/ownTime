# Architecture

This document describes the **system-level architecture** of ownTime: how the
deployable services fit together, the shared infrastructure, and the seams
that individual tools plug into.

It intentionally does **not** document any individual tool's internals
(todo, scribe, …). Each tool owns its own behavior and may carry its own docs.
This file covers only what is common to all of them.

> For the *why* behind these choices, see the ADRs in `docs/adr/`
> (0001/0002 stacks, 0003 workspace shell, 0004/0005 auth, 0006 service split).

---

## 1. Big picture

ownTime is a single productivity workspace. The user stays in one screen and
composes the tools they need as **resizable panels**. Since ADR 0006 the
system ships as **three independently deployable services**; the browser only
ever talks to one origin.

```
                        Browser (SPA)
                            │  same-origin HTTP; Authorization: Bearer <JWT>
┌───────────────────────────▼───────────────────────────────────┐
│  ui service          services/ui         (nginx container)     │
│  static workspace SPA + reverse proxy by path prefix           │
└───────┬────────────────────────────────────────┬──────────────┘
        │ /auth  /preferences                    │ /todos  /scribe
        │              private container network (overlay-ready)
┌───────▼─────────────────────┐   ┌──────────────▼───────────────┐
│  auth service               │   │  tools service               │
│  services/auth  (NestJS)    │◄──┤  services/tools (NestJS)     │
│  Google login · RS256 JWT   │   │  todo + clock + stopwatch    │
│  + JWKS · refresh rotation  │   │  + scribe                    │
│  · preferences store        │   │  verifies JWT via auth JWKS  │
├─────────────────────────────┤   ├──────────────────────────────┤
│  Postgres (own instance)    │   │  Postgres (own instance)     │
│  User · RefreshToken ·      │   │  Todo · ScribeNote           │
│  Preference                 │   │                              │
└─────────────────────────────┘   └──────────────────────────────┘
```

### Sub-projects

| Path | Status | Stack |
|------|--------|-------|
| `services/auth/` | active | TypeScript · NestJS · Prisma · PostgreSQL |
| `services/tools/` | active | TypeScript · NestJS · Prisma · PostgreSQL · jose (JWKS verify) |
| `services/ui/` | active | Vite · React 18 · TS · Tailwind v3 · TanStack Query · Zustand · react-resizable-panels · nginx (deploy) |
| `contracts/` | active | OpenAPI 3.1 — one spec per service |
| `deploy/` | active | docker-compose for the full stack |
| `mobile/` | empty | not yet chosen |

Each is a **separate sub-project with its own toolchain and lockfile** — no
shared code between services (ADR 0006 #8).

---

## 2. Cross-cutting concepts

### 2.1 Identity and trust (ADR 0004/0005/0006)

Users log in with Google. The **auth service** verifies the Google ID token
locally, then issues:

- a **5-minute RS256 access JWT** — the browser sends it as
  `Authorization: Bearer` on every request; its `sub` claim is the user id;
- a **rotating opaque refresh token** in an HttpOnly `SameSite=Strict` cookie
  (`Path=/auth`), with a 60s replay-grace window and family-revoking reuse
  detection.

Cross-service trust needs **no shared secret**: auth publishes its public keys
at `GET /auth/.well-known/jwks.json`, and every other service verifies tokens
against that JWKS (fetched over the internal network, cached, refetched on
unknown `kid`). Adding a service = point `AUTH_JWKS_URL` at auth.

Seams, one per side of the wire:
- **Frontend**: `lib/api-client.ts` attaches the token, single-flights
  refresh, and retries once on 401. Nothing else touches tokens.
- **Backends**: a global `AuthGuard` (APP_GUARD) sets `req.user`;
  `@CurrentUser()` reads it. Service code never sees a token.

Dev fallback: with `AUTH_ALLOW_DEV_HEADER=true` **and**
`NODE_ENV !== 'production'`, an `x-user-id` header is accepted instead.

### 2.2 Per-user isolation

- Every domain table carries an indexed `userId` column, and every query is
  scoped by it. Only auth's tables have a real `User` FK — for tools the
  verified JWT `sub` *is* the identity (no cross-database FKs, ADR 0006 #4).
- Frontend server-state (TanStack Query) keys include `userId`, so switching
  users transparently reloads that user's data and layout.

### 2.3 Preferences: one generic store for everyone

Any per-user setting — including the workspace layout itself — goes through a
single generic key/value store, hosted by the **auth service** (preferences
are user-profile data, ADR 0006 #6).

- **DB:** `Preference (userId, service, key) → value (JSONB)`, unique on the
  triple. New preference keys need **zero schema changes**.
- **API:** `/preferences/:service/:key` (see `contracts/auth.openapi.yaml`).
- **Frontend:** `usePreference<T>(service, key, default)` wraps it with
  optimistic updates and per-user cache keys.

The `service` field namespaces preferences. The workspace shell is *just
another namespace* (`service:'shell'`); clock stores its settings under
`'clock'` the same way.

### 2.4 Contracts (`contracts/`)

Each backend's HTTP surface is declared in an OpenAPI 3.1 spec. The specs are
the **source of truth for anything that crosses a service boundary**: the UI
proxy map, service-to-service calls, and a future mobile client all program
against them. Breaking a spec = breaking consumers; change spec and
implementation in the same PR.

---

## 3. Backend architecture (per service)

Each backend service is a self-contained NestJS app with the same internal
shape (deliberately duplicated, never shared — ADR 0006 #8):

```
services/<name>/
├── src/
│   ├── main.ts            bootstrap: global ValidationPipe, CORS
│   ├── app.module.ts      registers this service's modules + global AuthGuard
│   ├── common/
│   │   ├── auth/          the guard (JWKS verify; in the auth service this is
│   │   │                  instead the top-level auth/ feature module)
│   │   ├── prisma/        @Global() PrismaModule + PrismaService
│   │   └── decorators/    current-user.decorator.ts
│   └── services/<tool>/   one module per tool (controller + service + dto/)
├── prisma/                own schema + own migration history
├── docker-compose.yml     own dev Postgres (auth :5433, tools :5434)
├── Dockerfile             runs `prisma migrate deploy` then boots
└── .env(.example)         own configuration
```

**Isolation rules:**

- A service owns its database. Nothing else connects to it, ever.
- Tools inside the tools service stay module-isolated (no cross-module
  imports or table access) so a tool can be extracted into its own service
  later by repeating ADR 0006.
- All DTOs use `class-validator`; nothing bypasses the global `ValidationPipe`.
- Every route is guarded by default; only auth's login/refresh/JWKS routes are
  `@Public()`.

---

## 4. Frontend architecture

A **single-route SPA** hosting a workspace of resizable panels. There is **no
per-service URL** — every tool lives inside a panel inside the workspace tree.

```
src/
├── main.tsx           QueryClientProvider + StrictMode mount
├── App.tsx            gates the workspace behind LoginScreen
├── lib/
│   ├── api-client.ts  fetch wrapper; Bearer token + refresh  ← the auth seam
│   ├── auth-store.ts  Zustand session store (access token + profile)
│   ├── auth-actions.ts  loginWithGoogle / logout
│   ├── user-store.ts  Zustand store — userId for query keys
│   └── cn.ts          clsx + tailwind-merge helper
├── components/
│   ├── ui/            hand-rolled shadcn-style primitives
│   ├── auth/          LoginScreen (Google + dev-mode entry)
│   └── shell/         AuthMenu, UserSwitcher
├── preferences/       /preferences client + usePreference() hook
├── services/
│   ├── registry.ts    export const services: ServiceModule[]
│   └── <name>/        one folder per tool
└── workspace/         the shell that hosts panels (see §5)
```

**Requests are same-origin.** In dev, Vite proxies `/auth`, `/preferences`,
`/todos`, `/scribe` to the local services; in deploy, the UI container's nginx
does the identical mapping (`services/ui/nginx/`). `api-client.ts` is
oblivious to where services run.

**State model:** server state → TanStack Query keyed by `userId`; session →
`auth-store` (access token is memory-only; the refresh token lives in the
HttpOnly cookie); workspace layout → the `shell/layout` preference.

---

## 5. The workspace shell

The shell is a **recursive tree of panels**, persisted per user.

**Layout model** (`workspace/types.ts`):

```ts
type LeafNode  = { type:'leaf';  id; serviceId };
type SplitNode = { type:'split'; id; direction:'horizontal'|'vertical';
                   children: LayoutNode[]; sizes: number[] };
type LayoutNode = LeafNode | SplitNode;
```

- `workspace/layout-ops.ts` holds the pure tree operations (append, split,
  remove, resize, validate, prune unknown services, enforce singletons).
- `Workspace.tsx` renders the tree recursively with `react-resizable-panels`;
  `PanelFrame.tsx` provides panel chrome and wraps content in `overflow-auto`.
- `use-workspace-layout.ts` hydrates from the `shell/layout` preference and
  persists changes back debounced.

Because the layout is stored as a preference, it follows the same per-user
isolation as any tool — switching users reloads their layout automatically.

---

## 6. The tool contract (the extension seam)

**Backend** — a tool is a NestJS module under the owning service's
`src/services/<name>/`, registered in that service's `app.module.ts`. It owns
its Prisma model(s) (always with an indexed `userId` column), scopes every
query by `@CurrentUser()`, and uses the preferences API for per-user settings.
Its routes must be declared in the owning service's spec in `contracts/`.

**Frontend** — a tool exports a `ServiceModule` from its `index.tsx` and is
listed in `services/registry.ts`:

```ts
type ServiceModule = {
  id: string;                              // matches the preferences namespace
  label: string;                           // shown in menus + panel header
  icon: LucideIcon;
  panelComponent: ComponentType<PanelComponentProps>;  // rendered inside a panel
  singleton?: boolean;                     // at most one panel of this tool
};
```

`PanelComponentProps` gives each panel a stable `instanceId` (the leaf node
id) for scoping panel-local preferences. There is no `routes` field — **tools
don't own URLs**.

**Hard rules:** tools don't import each other; tools don't read or write
another tool's preference namespace. A brand-new *service* (vs. a tool inside
an existing one) additionally needs: its own directory under `services/`, its
own DB, a spec in `contracts/`, a proxy prefix in the UI's nginx template +
Vite config, and entries in `deploy/docker-compose.yml`.

---

## 7. Request lifecycle (example)

A typical write, end to end:

1. A panel component calls a tool hook → `lib/api-client.ts`.
2. `api-client` issues a same-origin `fetch` with
   `Authorization: Bearer <access token>` (refreshing once on 401 via the
   HttpOnly cookie).
3. The UI service's proxy (Vite in dev, nginx in deploy) forwards the request
   by path prefix to the owning service over the private network.
4. That service's `AuthGuard` verifies the JWT — against auth's JWKS in tools,
   with the local keypair in auth — and sets `req.user`.
5. The DTO is validated (global `ValidationPipe`), `@CurrentUser()` resolves
   the userId, and Prisma executes a query **scoped to that userId** in the
   service's own database.
6. The response flows back; TanStack Query caches it under a `userId`-keyed key.

---

## 8. Boundaries to respect

- Keep the auth seams: `api-client.ts` on the frontend, the per-service
  `AuthGuard` + `@CurrentUser()` on the backends. Service code never handles
  tokens.
- Don't add columns for preferences — use the preferences store.
- Never connect to another service's database or import across service
  directories. Cross-service HTTP goes through what `contracts/` declares.
- Read the relevant ADR before changing a foundation:
  - Backend foundations (DB/ORM/framework/validation) → **ADR 0001**.
  - Frontend foundations (build tool/framework/panel lib) → **ADR 0002**.
  - How panels work (registry contract, persistence, splits) → **ADR 0003**.
  - Auth shape (tokens, cookies, JWKS, dev header) → **ADR 0004/0005**.
  - Service boundaries, contracts, deploy topology → **ADR 0006**.
