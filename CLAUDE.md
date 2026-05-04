# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ownTime is a productivity tool intended to keep the user on a single task instead of switching between applications (per `README.md`). It hosts multiple in-app services (todo first, more later); each can have its own data and per-user preferences.

## Repo layout

| Path | Status | Notes |
|------|--------|-------|
| `webBrowser/backend/` | **active** | NestJS + Prisma + Postgres. See below. |
| `webBrowser/frontend/` | empty | Web client, stack not yet chosen. |
| `mobile/` | empty | Mobile client, stack not yet chosen. |
| `docs/adr/` | active | Architecture Decision Records. **Read 0001 before changing the backend's stack/structure.** |

Treat the three top-level areas as separate sub-projects with their own toolchains.

## Backend (`webBrowser/backend/`)

**Stack:** TypeScript + NestJS, Prisma ORM, PostgreSQL (Docker Compose for local dev). The architectural decisions (and the reasoning behind rejecting Rust/Go/Express/microservices) live in `docs/adr/0001-web-backend-initial-stack.md` — consult it before proposing alternatives.

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

There is no test harness yet — smoke tests are curl-based against a running server (see ADR or session history for the script).

### Architecture (the part that matters when adding code)

This is a **modular monolith**. The whole point of the structure is that **adding a new service should not touch existing services**.

```
src/
├── main.ts                 ← bootstrap, global ValidationPipe (whitelist+transform), CORS
├── app.module.ts           ← registers every service module here (one line per module)
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

### Adding a new service (the canonical recipe)

1. `mkdir src/services/<name>` — create `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, and a `dto/` folder.
2. Add a Prisma model to `prisma/schema.prisma` (include `userId String` and a `User` relation), then `npx prisma migrate dev --name add_<name>`.
3. Add `<Name>Module` to the `imports` array in `src/app.module.ts`.
4. If the service needs preferences, inject `PreferencesService` and call `.get/.set` with `service: '<name>'`. **Do not add new columns for prefs.**
5. Use `@CurrentUser() userId: string` in every endpoint. Always scope DB queries by `userId`.

**Hard rules:**
- Services do **not** import each other's `*.service.ts` directly. If service A needs B's data, B exports a provider, A adds B's module to its `imports`.
- Services do **not** query another service's tables in Prisma. Cross-service access goes through the exporting service's provider.
- All DTOs use `class-validator` decorators. Don't bypass the global `ValidationPipe`.

## When working here

- If asked to add code to `mobile/` or `webBrowser/frontend/`, confirm the stack with the user first — neither has been chosen.
- Preserve the `webBrowser/` directory name (not `web/`); it's intentional.
- Before changing backend foundations (DB engine, ORM, framework, auth shape, isolation rules), read `docs/adr/0001-web-backend-initial-stack.md` and either follow its "Revisit triggers" or open a new ADR.
