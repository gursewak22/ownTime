# ownTime

**Own your time.** ownTime is a productivity tool built around one idea: stay on a single task instead of bouncing between applications. Everything you need — tasks, notes, timers — lives as panels inside one workspace, so the work stays in front of you.

## How it works

The web client is a **single workspace of resizable panels**, not a sidebar with pages. You add a tool to the workspace, split it horizontally or vertically with others, and drag the dividers to lay things out how you like. The layout is saved per user and restored on the next visit.

## The tools

| Tool | What it does |
|------|--------------|
| **Todo** | Task list with per-user data. |
| **Clock** | Clock, stopwatch, and countdown timer. |
| **Scribe** | Rich-text notes you can also *draw on* — pen, highlighter, shapes, and point-anchored comments. Attach a PDF to annotate it, then export: annotated PDF (real sticky-note annotations that open in Preview/Acrobat/Chrome), snapshot PDF, or Markdown that keeps your styling. A note open in two tabs is automatically read-only in the second one. |

## Deployable services

Since ADR 0006, ownTime ships as **three independently deployable services**
that talk over a private container network — only the UI is exposed:

```
ownTime/
├── services/
│   ├── auth/       NestJS + Prisma + its own Postgres — Google login, RS256
│   │               tokens + JWKS, refresh rotation, per-user preferences
│   ├── tools/      NestJS + Prisma + its own Postgres — todo + clock +
│   │               stopwatch + scribe (/todos, /scribe)
│   └── ui/         UI service: Vite + React workspace shell, served by nginx
│                   which reverse-proxies API paths to the services above
├── contracts/      OpenAPI 3.1 spec per service — the inter-service contract
├── deploy/         docker-compose for the full stack (overlay-ready network)
├── mobile/         placeholder — stack not chosen yet
└── docs/
    ├── adr/        Architecture Decision Records (read before changing foundations)
    └── sprints/    planned work, written up before it's built
```

Identity crosses service boundaries as a short-lived RS256 JWT: the auth
service signs it, every other service verifies it against auth's published
JWKS (`/auth/.well-known/jwks.json`) — no shared secrets.

## Quick start (local development)

You need Node 20+, Docker, and npm. Each backend service runs against its own
Postgres container; run each block in its own terminal.

**1. Auth service** (`http://localhost:3001`):

```bash
cd services/auth
cp .env.example .env
docker compose up -d          # Postgres on :5433
npm install
npx prisma migrate dev
npm run start:dev
```

**2. Tools service** (`http://localhost:3002`):

```bash
cd services/tools
cp .env.example .env
docker compose up -d          # Postgres on :5434
npm install
npx prisma migrate dev
npm run start:dev
```

**3. UI** (`http://localhost:5173` — the Vite dev server proxies API paths to the two services):

```bash
cd services/ui
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173` and use **Continue in dev mode** (or set up
`GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` for real Google login).

## Deploying

The whole stack runs from one compose file — see `deploy/README.md` for
single-host and multi-host (swarm overlay) instructions:

```bash
cd deploy
cp .env.example .env          # set GOOGLE_CLIENT_ID + AUTH_JWT_PRIVATE_KEY
docker compose up -d --build
open http://localhost:8080
```

## Architecture in one minute

- **Three deployables** (ADR 0006): the browser talks only to the UI service's
  nginx, which proxies `/auth` + `/preferences` to the **auth** service and
  `/todos` + `/scribe` to the **tools** service over the internal network.
- **Auth** (ADR 0004/0005): Google login; the auth service issues 5-minute
  RS256 access tokens plus a rotating refresh token in an HttpOnly
  `SameSite=Strict` cookie, with reuse detection. Other services verify tokens
  via auth's JWKS and scope every query by the token's `sub`.
- **Contracts** (`contracts/`): each service's HTTP surface is an OpenAPI 3.1
  spec; cross-service calls may rely only on what the spec declares.
- **Preferences**: a generic `(userId, service, key) → JSON` store in the auth
  service gives any tool per-user settings with zero schema changes — the
  workspace layout itself is just the `shell/layout` preference.
- **Frontend**: each tool exports a `ServiceModule` (id, label, icon, panel
  component) registered in `src/services/registry.ts`; the workspace shell
  renders the panel tree with `react-resizable-panels`.

The reasoning (and rejected alternatives) lives in `docs/adr/` — 0001/0002
(stacks), 0003 (workspace shell), 0004/0005 (auth), 0006 (service split).

## Development commands

| Where | Command | What it does |
|-------|---------|--------------|
| services/* | `npm run start:dev` | service in watch mode |
| services/* | `npm run typecheck` / `npm run build` | type check / compile |
| services/* | `npx prisma migrate dev --name <name>` | create + apply a migration |
| services/* | `npx prisma studio` | browse that service's database |
| frontend | `npm run dev` | Vite dev server (with API proxy) |
| frontend | `npm run typecheck` / `npm run build` | type check / production build |
| deploy | `docker compose up -d --build` | build + run the full stack |

## Roadmap

- Server-side note edit locks (spec in `docs/sprints/0001-server-side-note-locks.md`)
- Mobile client (`mobile/` is reserved; stack TBD)
- More tools in the workspace
