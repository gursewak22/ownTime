# ADR 0003: Workspace shell with resizable multi-service panels

- Status: Accepted
- Date: 2026-05-04
- Deciders: gursewak22 (with Claude Code)
- Supersedes: shell sections of [ADR 0002](./0002-web-frontend-initial-stack.md)
  (specifically: sidebar + single-outlet routing of services). The rest of
  ADR 0002 (Vite, React+TS, Tailwind, TanStack Query, Zustand,
  user-switcher, preferences API integration) stays.

## Context

After ADR 0002 shipped, real use revealed that the headline feature the
user actually wants is **multiple services visible on one page, with
resizable panes**. The single-outlet/sidebar model only shows one service
at a time and can't deliver that.

This ADR pivots the shell to a workspace of nested split panes. Each leaf
hosts one service module. The layout is editable at runtime and persisted
per user.

## Decision summary

| #  | Area                | Decision                                                            |
|----|---------------------|---------------------------------------------------------------------|
| 1  | Layout primitive    | Nested split panes (horizontal/vertical), not a tile/grid dashboard |
| 2  | Library             | `react-resizable-panels`                                            |
| 3  | Layout data model   | Recursive `Split` (children + sizes) / `Leaf` (serviceId, instanceId) |
| 4  | Service contract    | `ServiceModule.panelElement` replaces `ServiceModule.routes`        |
| 5  | Multiple instances  | Allowed — each leaf has its own `instanceId`                        |
| 6  | Layout persistence  | Per user via `/preferences/shell/layout` (existing prefs API)       |
| 7  | Routing             | Single route `/`; deep-linking specific layouts is out of scope     |
| 8  | Add/close UI        | Toolbar `+ Add panel` menu; per-panel close button                  |

## Decisions in detail

### 1–2. Splits over tiles, via `react-resizable-panels`

- **Splits** match the user's "resizable windows" framing and the kind of
  multitasking productivity surface they want (focus on N things side by
  side).
- A **tile/grid dashboard** (e.g. `react-grid-layout`) gives free placement
  but encourages overlap, snapping, and visual chrome that doesn't fit a
  "stay on one task" tool.
- `react-resizable-panels` is the de-facto choice (used by shadcn/ui's
  `<Resizable>`); accessible (keyboard-resizable handles), tiny, and
  doesn't fight Tailwind.

### 3. Layout data model

```ts
type LeafNode = {
  type: 'leaf';
  id: string;          // unique node id (UUID)
  serviceId: string;   // matches ServiceModule.id
};
type SplitNode = {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  children: LayoutNode[];
  sizes: number[];     // percentages, length === children.length
};
type LayoutNode = LeafNode | SplitNode;
```

The root is always a `LayoutNode`. The renderer walks it recursively:
`SplitNode` → `<PanelGroup direction>` with one `<Panel>` per child and a
`<PanelResizeHandle>` between adjacent children; `LeafNode` →
`PanelFrame` (header + service's panel content).

### 4. `ServiceModule.panelElement`

The previous `routes: RouteObject[]` field assumed one URL per service.
The workspace doesn't use per-service URLs, so we drop it. Each module now
exports a single `panelElement: ReactNode` that renders inside a panel.
Services that need a more compact "panel-mode" UI vs. a full-page view
will have to handle that distinction internally; we don't add a second
`pageElement` field until a real second use case appears.

### 5. Multiple instances

Two leaves can reference the same `serviceId`. They share data (it's the
same backend rows for the same user) but render independently. Useful for,
e.g., one Todo panel showing all items and another filtered to just done
ones. Cheap to allow, no reason to forbid.

### 6. Layout persistence to backend

- Save to `/preferences/shell/layout` (key `layout`, value is the layout
  JSON tree). Reuses the existing prefs API; demonstrates exactly the
  cross-service preferences pattern ADR 0002 promised.
- Save is debounced after resize ends (handle drag stop).
- On user switch, the layout reloads automatically (TanStack Query cache
  key includes `userId`). So `demo` and `alice` can have entirely
  different workspaces — a clean visible demo of per-user state.
- Default fallback if no saved layout exists: a single Todo leaf.

### 7. Routing

The whole app lives at `/`. We give up:

- Per-service deep-link URLs (`/todo`, `/notes`)
- Browser back/forward navigating between services

Worth losing for a workspace tool — those aren't how this product is
used. If we ever need it, the layout JSON could be encoded into the URL
hash, but no need today.

### 8. Add / close UI

- A single dropdown button `+ Add panel` in the toolbar.
- Picking a service creates a new horizontal split appending the service
  to the rightmost panel. (Keep first iteration simple; richer split
  controls — split-current-panel, split-down — can come later.)
- Each panel has a small `×` in its header to close. Closing a leaf whose
  parent split now has only one child collapses that split. Closing the
  last panel leaves the workspace empty (with a "Add a panel to start"
  empty state).

## Consequences

**Positive**

- Delivers the headline "multiple services on one page, resizable" feature.
- Reuses the prefs API, exercising the multi-service architecture exactly
  as ADR 0001 designed.
- Adding a new service is still mechanical: implement `panelElement`,
  register in `services/registry.ts`. The "Add panel" menu picks it up
  for free.

**Negative / accepted tradeoffs**

- No URL-level deep linking to a single service.
- No mobile-friendly responsive collapse story yet — split panes assume
  a desktop-ish viewport. Add a "stack vertically below 768px" rule when
  mobile becomes a real concern.
- Multiple instances of a service might be confusing to users who don't
  realize they share data. Acceptable; a future `instanceState` slot in
  the layout could differentiate filters per panel.

## Alternatives considered (and rejected)

- **`react-grid-layout` (drag/drop tiles)** — overlap and snapping are
  noise for a focus tool.
- **Plain CSS Grid w/ hand-rolled drag handles** — re-invents what
  `react-resizable-panels` already does well, including keyboard a11y.
- **Keep ADR 0002's routing and add a "split view" mode on top** — half
  measure; complicates the registry contract for no real win.

## Revisit triggers

- A second use case wants a full-page view of a single service →
  reintroduce `pageElement` and a `/full/:serviceId` route alongside the
  workspace.
- Layout JSON gets large enough to slow prefs round-trips → switch to a
  dedicated `Layout` table.
- Mobile becomes a target → add responsive collapse, possibly a tab-based
  fallback under a breakpoint.
