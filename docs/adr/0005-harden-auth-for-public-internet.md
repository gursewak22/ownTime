# ADR-0005: Harden the Auth Service for Public-Internet Exposure

**Status:** Accepted

**Date:** 2026-07-08

**Author(s):** gursewak22 (with Claude Code)

**Supersedes:** decisions #5 (refresh rotation), #8 (frontend storage), and #9's
HS256 access token (now RS256 + JWKS) of
[ADR-0004](0004-google-login-local-token-auth.md); trips both its "public-internet
exposure" and "second service verifies tokens" revisit triggers.

---

### Context

ADR-0004 designed the auth service for a **trusted LAN over plain HTTP** with a
small, known user set. Several of its negatives were explicitly accepted *because*
of that threat model: the refresh token in `localStorage` (XSS-readable), no
refresh-reuse detection, no rate limiting, and no access-token revocation. ADR-0004
recorded these as acceptable and listed the exact conditions under which they stop
being acceptable.

The deployment target is now a **public-internet, multi-tenant SaaS over HTTPS**,
and the **auth service is deployed on its own**, separately from the other
backend services that consume its tokens. That change invalidates the assumptions
the LAN tradeoffs rested on:

- Clients are hostile and numerous → brute-force, DoS, and credential theft are
  now realistic, not theoretical.
- HTTPS is always present → the plain-HTTP objection that forced tokens into
  `localStorage` (rejecting `Secure` cookies) no longer holds.
- A stolen long-lived credential can be used from anywhere → "a leaked refresh
  token works forever, undetected" is now the dominant risk.
- **Token verification now happens outside the issuer.** Other services must
  verify access tokens without holding the signing key, which directly trips
  ADR-0004's first revisit trigger and rules out the shared HS256 secret (any
  holder could *mint*, not just verify, tokens).

**Quality attributes in play:**

- **Security (confidentiality of the long-lived credential):** XSS must not be
  able to exfiltrate the refresh token.
- **Security (theft detection):** reuse of a rotated refresh token must be
  *detected* and contained, not merely tolerated.
- **Availability under abuse:** the auth endpoints must survive brute-force and
  automated abuse.
- **Performance (per-request latency):** the property that made ADR-0004 good —
  a stateless, zero-DB, zero-network guard on every request — must be preserved.
- **Compatibility:** the change must stay inside ADR-0004's seam
  (`api-client.ts`, `@CurrentUser()`), not ripple into service code.

**Quality attribute scenario:** During normal operation, when an attacker who has
stolen a refresh token presents it more than the grace window (60s) after it was
last rotated, the system must **revoke the entire token family and reject the
request**, forcing the victim's next request to re-authenticate — while a
legitimate client that replays a just-rotated token inside the grace window (lost
response, second tab) still succeeds.

### Decision

**Keep the stateless Bearer-header access token and the zero-DB API guard as
ADR-0004 built them, but sign access tokens with RS256 and publish a JWKS so the
separately deployed services can verify them; and harden the refresh path — move
the refresh token into an `HttpOnly; Secure; SameSite=Strict` cookie, add
token-family lineage with reuse detection, rate-limit `/auth/*`, gate Google email
on `email_verified`, and shorten the access TTL to 5m.**

Decision detail:

| #  | Area                    | Decision                                                                                          |
|----|-------------------------|---------------------------------------------------------------------------------------------------|
| 1  | Refresh storage         | `HttpOnly; Secure; SameSite=Strict; Path=/auth` cookie (was `localStorage`)                       |
| 2  | Access storage          | Unchanged — in-memory, `Authorization: Bearer` header (keeps the API CSRF-immune)                 |
| 3  | CSRF                    | `SameSite=Strict` + Origin/Referer allowlist check on `/auth/refresh` and `/auth/logout` only     |
| 4  | Refresh lineage         | Add `familyId` + `rotatedAt` to `RefreshToken`; single-use rotation within a family               |
| 5  | Reuse detection         | Rotated token reused **> grace** ⇒ delete the whole family + audit; reused **≤ grace** ⇒ tolerate |
| 6  | Rate limiting           | `@nestjs/throttler` on `/auth/*`, strictest on `/auth/google`                                      |
| 7  | Google email trust      | Store `payload.email` only when `email_verified` is true; identity key stays `googleSub`          |
| 8  | Access TTL              | 15m → **5m**; logout revokes the refresh family (no per-request denylist)                          |
| 9  | Signing key             | **RS256** + a public `GET /auth/.well-known/jwks.json`; auth service holds the private key, other services verify via JWKS (`kid` for rotation) |
| 10 | Per-request guard       | **Unchanged** — one in-process `jwt.verify` (RS256, public key), no DB, no network                 |

### Alternatives Considered

**Alternative 1: Server-side denylist (`jti` in Redis) checked in the guard for
immediate access-token revocation**
- Description: on logout / compromise, add the token's `jti` to a Redis set with
  TTL = remaining token life; the guard checks it on every request.
- Why rejected (for now): reintroduces a network read on the hot path, partially
  surrendering the **per-request performance** property that is the design's whole
  point. A 5m access TTL plus refresh-family revocation covers the realistic SaaS
  need; the denylist buys only the residual ≤5m immediate-kill window at a
  permanent latency cost. Kept as a documented escalation if instant revocation
  of a live token ever becomes a hard requirement.

**Alternative 2: Keep `localStorage`, mitigate XSS with CSP hardening only**
- Description: leave the refresh token in `localStorage`, rely on a strict
  Content-Security-Policy to prevent script injection.
- Why rejected: CSP reduces XSS likelihood but a single bypass exfiltrates a
  30-day credential. Sacrifices **confidentiality of the long-lived credential**
  for the convenience of not touching the client. `HttpOnly` removes the token
  from JS reach entirely — defense that survives an XSS bug, not one that assumes
  none exist. HTTPS now makes `Secure` cookies free.

**Alternative 3: Hard delete-on-rotate with strict single-use (no grace window)**
- Description: delete the old refresh token the instant it is rotated; any reuse
  is a breach.
- Why rejected: reintroduces the two failure modes ADR-0004's grace window fixed
  — a lost rotation response permanently locks the client out, and a second tab
  holding the stale token force-logs the user out. It makes reuse detection
  trivially strict at the cost of **availability** for honest multi-tab users. The
  chosen design keeps the 60s grace window *and* adds detection: reuse inside the
  window is tolerated, reuse outside it is treated as theft.

**Alternative 4: Move to `SameSite=None` cookies + a double-submit CSRF token**
- Description: allow cross-site cookie sending and defend with a CSRF token
  echoed from a readable cookie.
- Why rejected: the SPA is same-origin with its API, so `SameSite=Strict`
  already blocks cross-site submission with zero moving parts. `SameSite=None`
  would *widen* the attack surface to defend a cross-site case we don't have.
  Extra **complexity** for no capability gained.

**Alternative 5: Keep the HS256 shared secret, distribute it to every verifier**
- Description: continue signing access tokens with a symmetric secret and hand
  that secret to each separately deployed service so it can verify.
- Why rejected: with the auth service deployed on its own, a shared symmetric
  secret means every consumer can also **mint** tokens, not just verify them —
  one compromised service forges identities for all. Sacrifices **security
  (issuer integrity)**. RS256 keeps the private key solely in the issuer; verifiers
  hold only the public key via JWKS. This is ADR-0004's Alternative 3, now
  promoted from "deferred" to "adopted" because the separate-deployment revisit
  trigger fired.

### Consequences

**Positive:**
- (+) **XSS can no longer steal the refresh token** — it is unreachable from JS
  (#1). An XSS bug now costs at most a ≤5m access token, not a 30-day credential.
- (+) **Refresh-token theft is detected and contained** — reuse outside the grace
  window revokes the whole family and emits an audit event (#4, #5), turning the
  design's largest ADR-0004 gap into an active tripwire. Honest multi-tab clients
  are unaffected.
- (+) **The API surface and hot path are untouched** — access tokens stay Bearer
  headers, so the whole service API remains CSRF-immune and the guard stays
  zero-DB / zero-network (#2, #10). This is a targeted hardening, not a rewrite.
- (+) **Auth endpoints survive abuse** — throttling bounds brute-force and the
  otherwise-unbounded `verifyIdToken` work (#6).
- (+) **Email spoofing closed** — `email_verified` gating plus `googleSub` as the
  identity key means a hijacked-but-unverified Google email can't link accounts
  (#7).
- (+) **Verification decoupled from issuance** — RS256 + JWKS lets the separately
  deployed services verify tokens with a public key they fetch and cache; only the
  auth service holds the private key, so a compromised consumer cannot forge
  tokens (#9). The `kid` allows key rotation without a flag-day.

**Negative (accepted trade-offs):**
- (-) **Logout still cannot instantly kill a live access token** — bounded now to
  ≤5m (was ≤15m). Eliminating this entirely requires Alternative 1's per-request
  denylist, which we deliberately declined for its latency cost.
- (-) **Shorter access TTL means more frequent refreshes** — ~3× the refresh rate
  of ADR-0004, so the 3-round-trip `issueSession` runs more often. Still off the
  hot path, but real write traffic; mitigated by trimming the redundant profile
  read on the refresh path.
- (-) **CSRF now requires active discipline** — the cookie makes `/auth/refresh`
  and `/auth/logout` CSRF-relevant; correctness depends on the `SameSite=Strict`
  + Origin-check pair staying in place (#3). A regression there is a real
  vulnerability, unlike in the header-only ADR-0004 design.
- (-) **Family revocation can log out an honest user on a false positive** — e.g.
  aggressive network retries replaying a token well outside the grace window read
  as theft. The 60s window is the tuning knob; too short raises false logouts,
  too long weakens detection.

**Neutral / Risks:**
- Cookie `Path=/auth` scoping assumes the auth endpoints stay under that prefix;
  a future auth route outside it would silently not receive the cookie.
- Audit/alerting on breach events is only as useful as the log pipeline behind
  it; this ADR mandates the event, not the alerting destination.
- RS256 introduces a JWKS fetch for out-of-process verifiers — a network
  dependency, but a cached one (same pattern as ADR-0004's Google-cert cache), so
  it stays off the steady-state hot path. Verifiers must handle key rotation by
  honouring `kid` and refetching JWKS on an unknown key id.
- The dev fallback auto-generates an *ephemeral* RS256 keypair when
  `AUTH_JWT_PRIVATE_KEY` is unset; tokens then invalidate on restart and differ
  per instance. Any shared or multi-instance deployment MUST provide a stable key
  (boot refuses to start without one when `NODE_ENV=production`).

### Revisit triggers

- **A dedicated key-management story is needed** (HSM, per-environment keys,
  scheduled rotation) → the `kid`-addressed JWKS built here is the seam; formalize
  key issuance/rotation behind it without touching token claims or verifiers.
- **Instant revocation of a live access token becomes a hard requirement**
  (e.g. compliance, admin "kill session now") → adopt Alternative 1's Redis `jti`
  denylist, accepting the per-request read.
- **False-positive family revocations become common** in telemetry → retune the
  grace window or move to an explicit idempotency key on refresh instead of a
  time window.
- **Native/mobile clients appear** → cookies don't fit; revisit refresh transport
  (secure device storage) for those clients specifically.

---

### Change Log

| Version | Date       | Author                        | Summary                                                                 |
| ------- | ---------- | ----------------------------- | ----------------------------------------------------------------------- |
| 1.1     | 2026-07-08 | Claude                        | Separate-deployment confirmed: flip signing to RS256 + JWKS (decision #9, new Alternative 5), also superseding ADR-0004 decision #9; record ephemeral-dev-key and JWKS-fetch risks. Reflects the implemented code. |
| 1.0     | 2026-07-08 | gursewak22 (with Claude Code) | Initial ADR — public-internet hardening of the auth service, superseding ADR-0004 decisions #5 and #8 |
