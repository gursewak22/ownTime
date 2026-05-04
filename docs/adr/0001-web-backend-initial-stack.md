# ADR 0001: Web backend initial stack and architecture

- Status: Accepted
- Date: 2026-05-03
- Deciders: gursewak22 (with Claude Code)

## Context

ownTime is a productivity tool that will host multiple in-app services
(todo first, more later). Each service may have its own data and per-user
preferences. The hard requirement is that **adding a new service later must
not require touching existing services**. This ADR records the foundational
decisions for `webBrowser/backend/`.

## Decision summary

| #  | Area              | Decision                                                                 |
|----|-------------------|--------------------------------------------------------------------------|
| 1  | Language          | TypeScript                                                               |
| 2  | Framework         | NestJS                                                                   |
| 3  | Architecture      | Modular monolith — one Nest module per service                           |
| 4  | Database          | PostgreSQL, single shared instance, single Prisma schema                 |
| 5  | ORM               | Prisma                                                                   |
| 6  | Local dev DB      | Postgres in Docker Compose                                               |
| 7  | User preferences  | Generic `Preference(userId, service, key, value JSONB)` table            |
| 8  | Service isolation | Services do not import each other; cross-service via exported providers  |
| 9  | Auth (v1)         | Deferred. Interim seam: `x-user-id` request header + `@CurrentUser()`    |
| 10 | Validation        | `class-validator` + global `ValidationPipe({ whitelist: true })`         |
| 11 | IDs               | `cuid()` via Prisma defaults                                             |
| 12 | User model (v1)   | Stub row keyed by `x-user-id`; auth fields (email, password) added later |

## Decisions in detail

### 1–2. TypeScript + NestJS (over Rust, Go, plain Express)

- **Why TS:** shared types with the future web frontend, fast iteration on a
  CRUD-heavy app, large ecosystem.
- **Why NestJS:** its module system maps 1:1 to "one service = one module."
  Adding a new service = new folder + one line in `app.module.ts`. Rivals
  would require us to invent that pattern.
- **Rust rejected because:** the workload is I/O-bound (Postgres CRUD); Rust's
  perf wins don't show, while compile times and borrow-checker friction slow
  iteration. No CPU-bound services on the roadmap.
- **Go rejected because:** good runtime, but no NestJS-equivalent paved path
  for modular services and no shared types with the frontend.
- **Express rejected because:** lighter, but module boundaries become
  hand-rolled and inconsistent as services multiply.
- **Escape hatch:** if a future service is genuinely CPU-bound (e.g. NLP),
  peel it out as a Rust microservice behind HTTP. Don't pre-optimize.

### 3. Modular monolith (over microservices)

One process, one deploy, one DB. Each service is a Nest module with its own
controller/service/DTOs/Prisma model. Services communicate (if ever) by
importing each other's exported providers, never by reaching into another
service's tables. This gives microservice-like isolation without the
distributed-systems tax.

### 4–6. Postgres + Prisma + Docker Compose

- **Postgres** for JSONB (preferences), real types, and parity with
  production.
- **Prisma** for typed DB access, declarative schema, and migrations.
- **Docker Compose** so dev DB setup is `docker compose up -d` — no
  per-developer install drift.
- Single DB, single schema. Per-service schemas/databases are deliberately
  rejected as overkill for a solo project; the **module boundary** is what
  enforces service separation, not the DB boundary.

### 7. Generic preferences table

```prisma
model Preference {
  userId  String
  service String
  key     String
  value   Json
  @@unique([userId, service, key])
}
```

Any service writes prefs through `PreferencesService.set(userId, service,
key, value)`. **Adding a new preference key requires zero schema changes** —
it's just a new row. JSONB lets the value be a string, number, object, or
array as needed.

### 8. Service isolation rule

Services may not `import` from another service's `*.service.ts` directly,
and may not query another service's tables in Prisma. If service A needs
data from service B, B exposes a provider in its module's `exports`, A adds
B's module to its `imports`. This is the rule that lets us extract a service
later if needed.

### 9. Auth deferred — `x-user-id` header as the seam

Auth is a follow-up. In the meantime, every controller takes `userId` from
an `x-user-id` request header via `@CurrentUser()`. On `Todo` create, we
upsert a `User` row by that id so foreign keys hold. When real auth lands:

- Replace the decorator's body to read from a JWT-validated request.
- Add `email`, `passwordHash`, etc. to the `User` model.
- All existing service data stays valid because everything is already
  user-scoped.

This means auth changes touch exactly one decorator and the `User` model —
no service code needs to change.

### 10. Validation

`ValidationPipe({ whitelist: true, transform: true })` is set globally in
`main.ts`. Unknown fields are dropped (not 400'd), bad types return 400.
DTOs use `class-validator` decorators. This is non-negotiable — every
service's controller relies on it.

### 11. IDs: `cuid()`

Sortable, URL-safe, collision-resistant, no need for the DB to assign them.
Prisma supports it natively. Avoids the integer-id enumeration leak and the
UUID-v4 index-locality problem.

### 12. User model is a stub today

`User` has only `id` and `createdAt` for now. This is intentional — it
reserves the table and the FK target so service data is correctly scoped
from day one, without forcing an auth scheme decision today.

## Consequences

**Positive**

- Adding the next service is mechanical: folder + Prisma model + one import.
- All service data is user-scoped from day one; no painful retrofit when
  auth lands.
- Frontend (when built) can share TS types directly — no codegen.
- Docker Compose makes dev setup reproducible across machines.

**Negative / accepted tradeoffs**

- NestJS has a learning curve (modules, providers, DI, decorators).
- Single DB means a runaway service can affect others' query latency. Not a
  concern at this scale.
- Deferring auth means `x-user-id` is trivially spoofable in the interim.
  **The backend is not safe to expose publicly until auth lands.** Local dev
  only.
- Prisma migrations are coupled across services (one `schema.prisma`).
  Acceptable; the module boundary is the real isolation line.

## Alternatives considered (and rejected)

- **Rust + axum** — perf overkill, slow iteration, no module paved path.
- **Go + chi/echo** — solid, but no shared types with frontend and no
  NestJS-style module pattern.
- **TypeScript + Express** — simpler start, but module discipline becomes
  ad-hoc as services multiply.
- **FastAPI (Python)** — different language from frontend kills shared types.
- **Microservices / one DB per service** — overkill for a solo project; the
  module boundary already gives us the isolation we need.
- **SQLite for dev** — risks dev/prod drift on JSONB and timestamp behavior.
- **UUID v4 / serial integer IDs** — `cuid()` wins on sortability + safety.

## Revisit triggers

Open this ADR again if any of the following happens:

- A service becomes CPU-bound (consider extracting to Rust).
- A service needs to scale or be deployed independently (consider extracting
  to its own process / DB).
- We start needing realtime/streaming features that don't fit a typical
  HTTP/REST module (consider WebSockets module or a separate service).
- Cross-service data access becomes frequent (the isolation rule may need
  formalization, e.g. a shared events module).
