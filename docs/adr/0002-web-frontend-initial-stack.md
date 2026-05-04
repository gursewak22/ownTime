# ADR 0002: Web frontend initial stack and architecture

- Status: Accepted
- Date: 2026-05-04
- Deciders: gursewak22 (with Claude Code)
- Builds on: [ADR 0001](./0001-web-backend-initial-stack.md)

## Context

`webBrowser/frontend/` was an empty directory. The frontend hosts the user
interface for the same set of in-app services that the backend serves
(todo first, more later). The same hard requirement carries over from
ADR 0001: **adding a new service later must not require touching existing
services**. The frontend has to mirror that on the UI side — an app shell
that hosts service modules registered through a single registry.

## Decision summary

| #  | Area                  | Decision                                                              |
|----|-----------------------|-----------------------------------------------------------------------|
| 1  | Build tool            | Vite                                                                  |
| 2  | Framework             | React 18 + TypeScript                                                 |
| 3  | Architecture          | App shell + service registry; one folder per service mirrors backend  |
| 4  | Routing               | React Router (data router via `createBrowserRouter`)                  |
| 5  | Server state          | TanStack Query                                                        |
| 6  | Global UI state       | Zustand (user switcher only, for now)                                 |
| 7  | Styling               | Tailwind CSS v3 + a tiny set of shadcn/ui-style hand-written primitives |
| 8  | Icons                 | `lucide-react`                                                        |
| 9  | Dev "current user"    | localStorage-backed user-id switcher widget; sent as `x-user-id`      |
| 10 | API base URL          | `VITE_API_URL` env var; defaults to `http://localhost:3000`           |

## Decisions in detail

### 1–2. Vite + React + TypeScript (over Next.js, SvelteKit)

- **Vite** for fast HMR and a minimal config surface. The product is a
  private dashboard, not a marketing site, so SSR/SSG are not needed.
- **React** chosen for ecosystem depth — most pre-built component libraries,
  most third-party integrations (calendar, drag-and-drop, charts) ship
  React-first.
- **Next.js rejected** because its App Router brings server components,
  layouts, and server actions that don't earn their complexity for a
  private SPA. The backend lives in NestJS already; we don't need a second
  server framework.
- **SvelteKit rejected** because it loses the cleanest path to share TS
  types with the NestJS backend later (via a workspace package).

### 3. App shell + service registry (mirrors backend module pattern)

The single most important decision in this ADR. Every service contributes:

- a route subtree (`/<service>` and any nested routes)
- a sidebar nav entry (label + icon)
- (optionally) a settings/preferences UI

via a single object registered in `src/services/registry.ts`:

```ts
type ServiceModule = {
  id: string;            // matches backend `service` for preferences
  label: string;
  icon: LucideIcon;
  basePath: string;      // e.g. '/todo'
  routes: RouteObject[]; // React Router v6 route objects
};
```

Adding a new service = create `src/services/<name>/index.ts` exporting a
`ServiceModule`, then add it to the registry array. The shell auto-builds
the sidebar and the router from the array. No edits to other services.

### 4. React Router (`createBrowserRouter`)

The data router lets each service own a `RouteObject[]` array independently,
which the shell composes. Older `BrowserRouter` + JSX `<Routes>` would
force services to know about each other's routes.

### 5. TanStack Query for server state

Every service uses TanStack Query for its API calls. Centralized cache,
automatic refetching, optimistic updates available when needed. The
backend's user-scoping means cache keys naturally include the current
user id.

### 6. Zustand for the tiny amount of cross-shell state

The current dev `userId` is the only true global. Zustand keeps it in
localStorage with a 30-line store; no Redux ceremony.

### 7. Tailwind + hand-written shadcn-style primitives

- Tailwind v3 (not v4) for ecosystem maturity.
- Instead of running the shadcn CLI (which is interactive and pulls in
  lots), we hand-write the small set of primitives we need: `Button`,
  `Input`, `Checkbox`, `Card`, `Select`. Each is ~30 lines of Tailwind +
  `class-variance-authority`. We own them; no version drift.
- More primitives can be added incrementally; if we ever need ~20+, switch
  to running the shadcn CLI for real.

### 8. `lucide-react` for icons

Tree-shakable, matches shadcn conventions, large enough catalog that
services rarely have to ship their own icons.

### 9. Dev "current user" — switcher widget

Until real auth lands, every API request sends `x-user-id: <id>` from a
Zustand store backed by localStorage. The header has a `<UserSwitcher>`
that lists known users (created on the fly) and lets you switch. This
makes the backend's per-user isolation visible in the UI from day one and
matches the `@CurrentUser()` seam on the backend — both swap to a real
auth flow later.

### 10. `VITE_API_URL`

Environment-driven. Default `http://localhost:3000` matches the backend
default port and is what `docker compose` brings up.

## Consequences

**Positive**

- Adding a new service is mechanical and symmetrical to the backend
  (folder + Prisma model + module on the back; folder + ServiceModule
  registration on the front).
- TanStack Query gives every service caching, refetching, and loading
  states for free.
- The user switcher means cross-user isolation can be demonstrated in the
  UI without auth.

**Negative / accepted tradeoffs**

- Hand-written primitives mean we don't get shadcn updates automatically.
  Acceptable while the set is small.
- Tailwind v3 will need a v4 migration eventually.
- No SSR/SEO. Acceptable: a private productivity tool doesn't need either.

## Alternatives considered (and rejected)

- **Next.js** — overkill for an SPA dashboard.
- **SvelteKit** — loses TS DTO sharing with NestJS.
- **Mantine / Chakra** — fuller libraries but heavier and more opinionated
  than the four primitives we actually need.
- **Redux / Redux Toolkit** — too much ceremony for one piece of global
  state (current user).
- **shadcn CLI bootstrap** — interactive; would pull in components we
  don't need yet.

## Revisit triggers

- Component library outgrows ~15 hand-written primitives → run the shadcn
  CLI properly.
- A service genuinely needs SSR (public landing, share-link previews) →
  consider Next.js for that one route or split it into a separate marketing
  app.
- The frontend grows to a size where bundle splitting matters → adopt
  React Router lazy routes per service module (currently eager for
  simplicity).
