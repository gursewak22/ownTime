# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ownTime is a productivity tool intended to keep the user on a single task instead of switching between applications (per `README.md`). It hosts multiple in-app tools (todo, clock, scribe, more later); the web client renders them as resizable panels in a single workspace, not a sidebar+page navigation.

Since **ADR 0006** the system is split into **independently deployable services** that talk over a private container network. There is no monolith backend anymore.

## Repo layout

| Path | Status | Notes |
|------|--------|-------|
| `services/auth/` | **active** | NestJS + Prisma + own Postgres. Google login, RS256 access tokens + JWKS, refresh rotation, and the per-user preferences store. Routes: `/auth`, `/preferences`. |
| `services/tools/` | **active** | NestJS + Prisma + own Postgres. Todo + clock + stopwatch + scribe. Routes: `/todos`, `/scribe`. Verifies JWTs against the auth service's JWKS. |
| `services/ui/` | **active** | The **UI service**: Vite + React + TS workspace shell. Deploys as nginx serving the build and reverse-proxying API paths to the services. |
| `contracts/` | **active** | OpenAPI 3.1 spec per service — the source of truth for anything crossing a service boundary. Update the spec in the same PR as the endpoint. |
| `deploy/` | **active** | docker-compose for the full stack (overlay-ready network). See `deploy/README.md`. |
| `mobile/` | empty | Mobile client, stack not yet chosen. |
| `docs/adr/` | active | **Read 0001+0004+0006 before changing any backend service; 0002+0003 before changing the frontend; 0004+0005 before changing anything auth-related; 0006 before changing service boundaries, contracts, or deploy topology.** |

Treat every service as a separate sub-project with its own toolchain, lockfile, and database. **There is no shared code between services** (ADR 0006 #8) — scaffolding is deliberately duplicated.

## Backend services (`services/auth/`, `services/tools/`)

**Stack:** TypeScript + NestJS, Prisma ORM, PostgreSQL (one instance per service, Docker Compose for local dev). Foundational decisions live in ADR 0001; the service split in ADR 0006 — consult them before proposing alternatives.

### One-time setup (per service)

```bash
cd services/<name>
cp .env.example .env
docker compose up -d              # that service's Postgres (auth :5433, tools :5434)
npm install
npx prisma migrate dev            # also runs `prisma generate`
```

### Daily commands (run inside the service directory)

| Command | What it does |
|---|---|
| `npm run start:dev` | watch mode — auth on `:3001`, tools on `:3002` (via `.env` PORT) |
| `npm run build` / `npm run typecheck` | compile to `dist/` / `tsc --noEmit` |
| `npx prisma migrate dev --name <name>` | create + apply a migration (this service's DB only) |
| `npx prisma studio` | DB browser for this service's database |
| `docker compose down` / `down -v` | stop / nuke this service's dev DB |

There is no test harness yet — smoke tests are curl-based against a running service (`x-user-id` dev header works outside production when `AUTH_ALLOW_DEV_HEADER=true`).

### Architecture (the part that matters when adding code)

Each service is a self-contained NestJS app with the same internal shape:

```
services/<name>/src/
├── main.ts                 ← bootstrap, global ValidationPipe, CORS
├── app.module.ts           ← this service's modules + global APP_GUARD
├── common/
│   ├── auth/               ← the guard (JWKS fetch via jose). In the auth service
│   │                          this is instead the top-level auth/ feature module
│   ├── prisma/             ← @Global() PrismaModule + PrismaService
│   └── decorators/current-user.decorator.ts   ← THE auth seam
└── services/<tool>/        ← one module per tool (controller/service/dto)
```

**Trust model (ADR 0005/0006):** the auth service signs 5-minute RS256 access JWTs and publishes public keys at `GET /auth/.well-known/jwks.json`. Other services verify with `jose`'s cached remote JWK set (`AUTH_JWKS_URL`) — no shared secrets. The refresh token rides an HttpOnly `SameSite=Strict` cookie (`Path=/auth`) with rotation + reuse detection; `/auth/*` is rate-limited and Origin-checked. Dev fallback: `AUTH_ALLOW_DEV_HEADER=true` **and** `NODE_ENV !== 'production'` accepts `x-user-id`.

**Identity in data:** only the auth DB has a `User` table. In other services `userId` is a plain indexed string column (the verified JWT `sub`) — no cross-service FKs, no `User` upserts.

**Per-user preferences for any tool** go through the auth service's `/preferences/:service/:key` (generic `(userId, service, key) → JSONB` store). Adding a preference key requires zero schema changes. **Do not add new columns for prefs.**

### Adding a new tool to an existing service (e.g. tools)

1. `mkdir services/tools/src/services/<name>` — `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, `dto/`.
2. Add a Prisma model to that service's `prisma/schema.prisma` (with an indexed `userId String` column, **no** User relation), then `npx prisma migrate dev --name add_<name>`.
3. Add `<Name>Module` to the `imports` array in that service's `src/app.module.ts`.
4. Declare the new routes in the owning service's spec in `contracts/`.
5. If the route prefix is new, add it to the UI proxy map: `services/ui/vite.config.ts` **and** `services/ui/nginx/default.conf.template`.
6. Use `@CurrentUser() userId: string` in every endpoint and scope every query by `userId`. The global guard already protects every route — never mark a tool route `@Public()`.

### Adding a whole new service

Follow ADR 0006: copy the shape of `services/tools` (own package.json, prisma schema + DB + compose, Dockerfile, guard verifying via `AUTH_JWKS_URL`), write `contracts/<name>.openapi.yaml`, add proxy prefixes to the UI (vite + nginx), and add the service + its DB to `deploy/docker-compose.yml`.

**Hard rules:**
- Never connect to another service's database or import across service directories. Cross-service HTTP goes only through what `contracts/` declares.
- Inside a service, tool modules do not import each other's `*.service.ts`; if module A needs B's data, B exports a provider and A imports B's module.
- All DTOs use `class-validator` decorators. Don't bypass the global `ValidationPipe`.

## UI service (`services/ui/`)

**Stack:** Vite + React 18 + TypeScript, Tailwind v3, TanStack Query for server state, Zustand for session/user stores, `react-resizable-panels` v2. Deploys as an nginx container (see `Dockerfile` + `nginx/`). Foundational decisions in ADR 0002; the **workspace shell** in ADR 0003 — read 0003 before changing how panels are added/removed/persisted.

### One-time setup

```bash
cd services/ui
cp .env.example .env              # VITE_API_URL stays empty — same-origin via proxy
npm install
```

### Daily commands (run from `services/ui/`)

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `http://localhost:5173` (proxies `/auth`,`/preferences` → :3001 and `/todos`,`/scribe` → :3002) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |

Both backend services must be running for the UI to load data.

### Architecture (the part that matters when adding code)

Single-route SPA hosting a workspace of resizable panels; no per-service URL.

```
src/
├── main.tsx                ← QueryClientProvider + StrictMode mount
├── App.tsx                 ← gates the workspace behind LoginScreen
├── lib/
│   ├── api-client.ts       ← same-origin fetch wrapper; Bearer token, single-flight refresh + 401 retry
│   ├── auth-store.ts       ← Zustand session store (access token + profile; refresh token is an HttpOnly cookie)
│   ├── auth-actions.ts     ← loginWithGoogle / logout
│   └── user-store.ts       ← Zustand store (userId for query keys)
├── components/
│   ├── ui/                 ← hand-rolled shadcn-style primitives
│   ├── auth/LoginScreen.tsx
│   └── shell/              ← AuthMenu, UserSwitcher
├── preferences/            ← /preferences client + usePreference() hook
├── services/
│   ├── registry.ts         ← export const services: ServiceModule[]
│   └── <name>/             ← one folder per tool (todo, clock, scribe)
└── workspace/              ← recursive panel tree (see ADR 0003)
```

**The single auth seam is `lib/api-client.ts`.** Requests are **same-origin** — the Vite proxy (dev) or the UI's nginx (deploy) routes path prefixes to the right service, so the frontend never knows where services live. Don't put absolute service URLs anywhere else. In dev mode ("Continue in dev mode") it falls back to the `x-user-id` header. `user-store.currentUserId` remains the source of truth for query keys — never read identity anywhere else.

**The workspace layout is persisted per user** via the preferences endpoint (`/preferences/shell/layout`), same as any tool's settings.

**Service registry contract** (`src/services/registry.ts`): a tool exports `{ id, label, icon, panelComponent, singleton? }`. No `routes` field — tools don't own URLs.

### Adding a new tool (frontend recipe)

1. `mkdir src/services/<name>` — typical layout: `index.tsx` (the module), `api.ts`, `hooks.ts`, `pages/<Name>Panel.tsx`, optional `components/`.
2. Implement the panel component; internal padding/scroll is the tool's responsibility (`PanelFrame` wraps content in `overflow-auto`).
3. Export a `ServiceModule` from `index.tsx`; add it to the `services` array in `src/services/registry.ts`.
4. For persistent prefs use `usePreference<T>(serviceId, key, defaultValue)`.

**Hard rules:**
- Tools don't import each other and don't touch another tool's preference namespace.
- Server state goes through TanStack Query, keyed by `userId`. Don't fetch inside `useEffect` if a hooks pattern fits.

## Deploying

`deploy/docker-compose.yml` runs everything: per-service Postgres, auth, tools, and the UI (the only published port). Backends apply their own migrations on boot. For swarm/overlay, create an attachable overlay network and mark it external — instructions in `deploy/README.md`.

## When working here

- If asked to add code to `mobile/`, confirm the stack with the user first — it's still empty.
- Any change to a service's HTTP surface must update its spec in `contracts/` in the same change.
- Before changing **backend** foundations (DB engine, ORM, framework, validation), read ADR 0001. Before changing **auth** (token shape, cookies, JWKS, dev header), read ADR 0004+0005. Before changing **service boundaries, contracts, or deploy topology**, read ADR 0006. Either follow the ADR's revisit triggers or open a new ADR.
- Before changing **frontend** foundations read ADR 0002; before changing **how panels work**, read ADR 0003.
