# ADR 0006: Split the monolith into independently deployable services

- Status: Accepted
- Date: 2026-07-08
- Deciders: gursewak22 (with Claude Code)
- Supersedes: ADR 0001 decision #3 (modular monolith) and #4 (single DB/schema).
  Everything else in ADR 0001 (stack, validation, IDs, preference store,
  isolation rules) still stands, now enforced per process instead of per module.

## Context

ADR 0001 chose a modular monolith and named its own revisit trigger: *"a
service needs to scale or be deployed independently (consider extracting to
its own process / DB)."* That trigger has fired — the services will be
deployed as separate Docker containers, potentially on separate hosts, joined
by a private container network (overlay when on swarm). Auth was already
designed for this future: ADR 0005 moved token signing to RS256 with a
published JWKS precisely so *"separately deployed services verify without the
signing key."*

## Decision summary

| # | Area | Decision |
|---|------|----------|
| 1 | Service cut | Three deployables: **auth**, **tools** (todo + clock + stopwatch + scribe), **ui** |
| 2 | Repo layout | `services/auth`, `services/tools`, `services/ui`, `contracts/`, `deploy/` |
| 3 | Contracts | Hand-written OpenAPI 3.1 specs in `contracts/` are the inter-service source of truth |
| 4 | Data | One Postgres **per backend service**; no cross-service FKs; `userId` is a plain column outside auth |
| 5 | Trust | Bearer JWT (RS256) verified against the auth service's JWKS over the internal network |
| 6 | Preferences | The generic store stays whole and lives in the **auth** service |
| 7 | Topology | Only the UI publishes a port; its nginx proxies path prefixes to services by Docker DNS name |
| 8 | Code sharing | None. Each service vendors its own guard/prisma scaffolding and `package.json` |

## Decisions in detail

### 1. The service cut

- **auth** — Google login, access/refresh tokens, JWKS, and the preferences
  store. Owns `User`, `RefreshToken`, `Preference`.
- **tools** — the user-facing productivity tools, combined by explicit choice
  (they are small, ship together, and splitting them would triple the NestJS/
  Prisma/Postgres overhead for no isolation win): todo + scribe on the server
  (`/todos`, `/scribe`), clock/stopwatch purely client-side. Owns `Todo`,
  `ScribeNote`.
- **ui** — the workspace SPA as a static-file + reverse-proxy nginx container.
  It has no API of its own.

### 3. OpenAPI contracts in `contracts/`

With separate deployables there is no compiler across the wire anymore.
`contracts/<service>.openapi.yaml` declares each service's full HTTP surface;
consumers may rely only on what a spec declares, and spec changes ship in the
same PR as the implementation. Hand-written rather than generated so the
contract stays reviewable and deliberate (generation from Nest decorators can
be added later without changing the contract's role).

### 4. Database per service

Each backend gets its own Postgres instance/volume and its own
`prisma/schema.prisma` + migration history; containers run
`prisma migrate deploy` on boot so a service deploys alone. The old
cross-table `User` relations are gone: outside auth, `userId` is just an
indexed string column whose value is the verified JWT `sub`. The referential
integrity we lose is the price of independent deploys (accepted); user
deletion becomes a fan-out concern for a future janitor job.

### 5. Trust between services

Unchanged from ADR 0005, now exercised for real: auth signs RS256 access
tokens (5m TTL) and publishes public keys at `/auth/.well-known/jwks.json`;
tools verifies with `jose`'s cached remote JWK set (`AUTH_JWKS_URL`) and never
holds a signing secret. The x-user-id dev header survives, double-gated
(`AUTH_ALLOW_DEV_HEADER=true` **and** `NODE_ENV !== 'production'`), in every
service.

### 6. Preferences stay whole, in auth

Preferences are per-user profile data, not per-tool data: the shell layout
(`service:'shell'`) belongs to no tool service, and splitting the store per
service would force the frontend to route each namespace differently. The auth
service is already the "who is this user" service, so it keeps the single
generic store and the `/preferences/:service/:key` API — any new service still
gets settings with zero schema changes.

### 7. Only the UI faces the internet

The browser talks to exactly one origin. nginx inside the UI container proxies
by path prefix — `/auth`, `/preferences` → auth; `/todos`, `/scribe` → tools —
over the private network (bridge on one host, attachable overlay on swarm).
Backends are never published. The Vite dev server mirrors the same prefix map,
so `api-client.ts` is identical in dev and prod (same-origin, no per-service
URLs in the frontend).

### 8. No shared code between services

The duplicated scaffolding (prisma module, guard shape, dto style) is a few
files per service. A shared library would re-couple deployables through a
version bump and contradict the reason for splitting. If the duplication ever
hurts, revisit with a published internal package — not imports across service
directories.

## Consequences

**Positive**
- Each service builds, migrates, deploys, restarts, and scales alone.
- A tools compromise can't read `RefreshToken`; DB blast radius is per service.
- The contract folder makes the wire surface explicit and reviewable.
- Frontend needed almost no changes (one seam, same-origin requests).

**Negative / accepted**
- No cross-service referential integrity; user deletion is now a fan-out.
- Three `npm install`s, three lockfiles, duplicated scaffolding to patch.
- More runtime moving parts (per-service DBs, JWKS fetch path, proxy config).
- In-memory throttler in auth still binds it to one replica until a shared
  store is added.

## Revisit triggers

- A third backend service appears → consider extracting the JWKS guard into a
  published internal package instead of a third copy.
- Cross-service data needs emerge (e.g. tools wanting profile emails) →
  service-to-service calls must go through `contracts/`, never shared tables.
- User deletion ships → design the cross-service cleanup story.
