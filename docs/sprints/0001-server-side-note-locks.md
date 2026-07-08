# Sprint: server-side note locks for Scribe

**Status:** planned (not started)
**Created:** 2026-07-03

## Why

Scribe notes now have a strict single-editor rule: when a note is open in one
panel or browser tab, every other panel/tab shows it read-only, and editing
hands over automatically when the owner closes. This is implemented entirely
client-side with the Web Locks API
(`services/ui/src/services/scribe/lib/note-lock.ts`).


Web Locks are scoped to **one browser profile on one machine**. The rule is
therefore not enforced when the same user opens a note from:

- a different browser (Chrome + Safari),
- a different device,
- an incognito/second profile window.

In those cases we silently fall back to the old last-write-wins-per-channel
behavior. Once the app is reachable from more than one machine (or real auth
lands), that hole matters.

## Goal

Enforce the single-editor rule in the backend so it holds across browsers and
devices, while keeping the in-browser Web Locks layer as the fast path.

## Sketch (to be refined when the sprint starts)

- `POST /scribe/notes/:id/lock` — acquire with a client-generated holder id;
  server stores `(noteId, holderId, expiresAt)` with a short TTL (~30 s).
- Holder heartbeats to extend the TTL; lock evaporates on missed heartbeats,
  so a crashed client can't wedge a note.
- `PATCH /scribe/notes/:id` rejects with `409 Conflict` when a different
  holder owns a live lock — this is the actual enforcement; the UI treats a
  409 like today's read-only state.
- `DELETE /scribe/notes/:id/lock` on unmount for immediate handover.
- Frontend: `useNoteLock` becomes a two-layer check — Web Locks first (free,
  instant, same-browser), then the server lock. Read-only panels poll or get
  the lock on the next heartbeat gap.

## Constraints

- Follow the module isolation rules in `CLAUDE.md` — the lock table/endpoints
  live inside the scribe module.
- Locks are per `(userId, noteId)`; auth is still the `x-user-id` header seam,
  so this is not a security boundary until real auth ships (see ADR 0001).
- Don't regress the existing UX: automatic takeover when the owner closes,
  and the read-only banner, must keep working exactly as they do now.

## Acceptance

1. Two browsers (or two devices) on the same note: second one is read-only.
2. Kill the owning browser process: the other side becomes editable within
   one TTL window without any server restart.
3. A forced concurrent `PATCH` from a non-holder returns 409 and the UI
   surfaces read-only instead of silently losing data.
4. Existing Playwright lock suite (`drive-lock.mjs` scenarios) still passes.
