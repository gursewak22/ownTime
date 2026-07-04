# ownTime

**Own your time.** ownTime is a productivity tool built around one idea: stay on a single task instead of bouncing between applications. Everything you need — tasks, notes, timers — lives as panels inside one workspace, so the work stays in front of you.

## How it works

The web client is a **single workspace of resizable panels**, not a sidebar with pages. You add a service to the workspace, split it horizontally or vertically with others, and drag the dividers to lay things out how you like. The layout is saved per user and restored on the next visit.

## Services

| Service | What it does |
|---------|--------------|
| **Todo** | Task list with per-user data. The reference implementation for new services. |
| **Clock** | Clock, stopwatch, and countdown timer. |
| **Scribe** | Rich-text notes you can also *draw on* — pen, highlighter, shapes, and point-anchored comments. Attach a PDF to annotate it, then export: annotated PDF (real sticky-note annotations that open in Preview/Acrobat/Chrome), snapshot PDF, or Markdown that keeps your styling. A note open in two tabs is automatically read-only in the second one. |

More services are planned; the architecture is built so adding one never touches the others.

## Repo layout

```
ownTime/
├── webBrowser/
│   ├── backend/    NestJS + Prisma + PostgreSQL API (modular monolith)
│   └── frontend/   Vite + React + TypeScript workspace shell
├── mobile/         placeholder — stack not chosen yet
└── docs/
    ├── adr/        Architecture Decision Records (read before changing foundations)
    └── sprints/    planned work, written up before it's built
```

## Quick start

You need Node 20+, Docker, and npm.

**1. Backend** (API on `http://localhost:3000`):

```bash
cd webBrowser/backend
cp .env.example .env
docker compose up -d          # PostgreSQL on :5432
npm install
npx prisma migrate dev        # applies migrations + generates the client
npm run start:dev
```

**2. Frontend** (app on `http://localhost:5173`):

```bash
cd webBrowser/frontend
cp .env.example .env          # points at the backend
npm install
npm run dev
```

Open `http://localhost:5173`, pick a user in the header, and add panels with the **Add panel** button.

## Architecture in one minute

- **Backend** is a modular monolith: each service is a self-contained NestJS module with its own tables, registered in one line in `app.module.ts`. Services never import each other's internals or query each other's tables. A generic **preferences** store (`userId`, `service`, `key`, JSON `value`) gives any service per-user settings with zero schema changes.
- **Frontend** mirrors that: each service exports a `ServiceModule` (id, label, icon, panel element) and registers in `src/services/registry.ts`. The workspace shell renders the panel tree with `react-resizable-panels` and persists it through the same preferences API every service uses.
- **Auth is deferred by design.** The current identity is an `x-user-id` header injected by a single seam on each side (`@CurrentUser()` on the backend, `lib/api-client.ts` on the frontend). Swapping in real auth touches only those two places.

> ⚠️ Because auth is a placeholder, the backend is **not safe to expose publicly** yet. Run it locally.

The reasoning behind these choices (and the alternatives rejected) is written down in `docs/adr/` — start with ADR 0001 (backend stack), 0002 (frontend stack), and 0003 (workspace shell).

## Development commands

| Where | Command | What it does |
|-------|---------|--------------|
| backend | `npm run start:dev` | API in watch mode |
| backend | `npm run typecheck` / `npm run build` | type check / compile |
| backend | `npx prisma migrate dev --name <name>` | create + apply a migration |
| backend | `npx prisma studio` | browse the database |
| frontend | `npm run dev` | Vite dev server |
| frontend | `npm run typecheck` / `npm run build` | type check / production build |

## Roadmap

- Real authentication behind the existing single-seam design
- Server-side note edit locks (spec in `docs/sprints/0001-server-side-note-locks.md`)
- Mobile client (`mobile/` is reserved; stack TBD)
- More services in the workspace
