# Sprint: constrain the assistant's outbound endpoint (SSRF on provider baseUrl)

**Status:** planned (not started)
**Created:** 2026-07-19
**Relates to:** ADR 0007 (assistant service) + its Ollama-default addendum

## Why

The assistant service lets each user store a provider `baseUrl` that the agent
then calls server-side. The field is validated for URL **shape only**:

```ts
// services/assistant/src/services/provider/dto/set-provider.dto.ts
@IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
@MaxLength(500)
baseUrl?: string;
```

`require_tld: false` intentionally permits bare internal hostnames and IP
literals (that is how `http://localhost:11434` and `http://host.docker.internal`
work for local Ollama). `ProviderService.set()` stores the value with only a
trailing-slash strip — **no allowlist, no loopback/private-range filter**. On
`POST /assistant/chat`, the stored value flows unchanged into the outbound
client and the agent loop fires a server-side request from inside the assistant
container:

```ts
// services/assistant/src/services/chat/agent.service.ts
const client = new Anthropic({ apiKey: apiKey ?? 'not-needed', baseURL: baseUrl ?? undefined });
// ... toolRunner() → POST {baseUrl}/v1/messages
```

`ChatService.send()` then behaves as an **error oracle**: its
`APIConnectionError` vs `APIError` branches leak host/port reachability, and the
`APIError` branch surfaces the upstream response `message` back to the caller
(`services/assistant/src/services/chat/chat.service.ts:73-85`).

### Impact

Server-Side Request Forgery with attacker-controlled **host, port, and
protocol** (not merely path). Any ordinary authenticated user (no admin) can:

1. `PUT /assistant/provider` with e.g.
   `{"baseUrl":"http://tools:3000","model":"x"}` — also `auth:3000`, a
   Postgres/Redis `host:port`, `169.254.169.254`, or the docker host via the
   `host.docker.internal:host-gateway` mapping added to
   `deploy/docker-compose.yml`. Passes validation, gets stored.
2. `POST /assistant/chat` with any message → the assistant container issues an
   HTTP request to that host.
3. Read the returned 502/400 text plus connection-error-vs-HTTP-error timing to
   **probe and fingerprint the internal service network** across the container
   trust boundary.

### Severity: Medium/High (confirmed, with nuance)

Not top severity because the request is constrained to `POST` with a JSON body
to a fixed `/v1/messages` suffix, so classic GET-based cloud-metadata exfil
(IMDSv1) is impractical. The realistic impact is internal-network reachability
probing + a response/error oracle. Still a genuine, actionable SSRF with no
mitigating control present, and it is **newly introduced** by the assistant
service — worth closing before this is exposed beyond a single trusted host.

Reviewed clean in the same pass (no action needed): the AES-256-GCM key
encryption (`common/crypto/secret-box.ts`, random per-message IV + auth tag),
the decrypted key never leaving the process (only a masked `sk-…xxxx` hint is
returned; `serverDefault` exposes only base URL + model name), and the auth
guard / dev-header double-gate matching the vetted tools-service guard.

## Goal

Stop an authenticated user from turning the assistant's outbound egress into an
internal-network probe, **without breaking the core feature** — which
legitimately targets loopback/private addresses (`localhost:11434`,
`host.docker.internal`). A naive private-IP denylist would break BYO-Ollama, so
that is explicitly *not* the approach.

## Sketch (to be refined when the sprint starts)

Pick per deployment posture; (1) is the cheapest real mitigation:

1. **Env-configured endpoint allowlist.** An `ASSISTANT_ALLOWED_ENDPOINTS`
   (comma-separated host[:port] list) that `ProviderService.set()` checks the
   `baseUrl` host against before storing, and re-checks in `settings()` before
   use. The server default
   (`ASSISTANT_DEFAULT_BASE_URL`) is implicitly on the list. Empty list =
   default-only (no custom per-user endpoints).
2. **Opt-in flag for custom endpoints.** `ASSISTANT_ALLOW_CUSTOM_ENDPOINT`
   (default off). When off, users may only use the server default or a hosted
   Anthropic key — no arbitrary `baseUrl`. When on, deployments accept the SSRF
   surface knowingly (e.g. trusted single-tenant).
3. **Close the oracle.** For a non-Anthropic host, do not echo the upstream
   response body / provider error `message` back to the caller — return a
   generic "endpoint error" so response fragments and fine-grained reachability
   don't leak. Keep the friendly message for the known-Anthropic path.
4. (Optional, defense in depth) Pin the resolved IP and reject a mismatch on the
   actual connection to blunt DNS-rebind, once an allowlist exists.

## Constraints

- Must not regress the Ollama default: `localhost:11434` /
  `host.docker.internal` must keep working with zero extra setup on a single
  host (they are loopback/private by nature).
- The `baseUrl` surface crosses the service boundary — any change to accepted
  values updates `contracts/assistant.openapi.yaml` in the same change
  (see `CLAUDE.md`).
- Selection is config-driven (env), not hardcoded, so single-tenant trusted
  deployments can keep BYO-endpoint and multi-tenant ones can lock it down.
- If the endpoint trust story changes materially, record it (amend ADR 0007 or
  a new ADR) rather than silently diverging.

## Acceptance

1. With the default config, a user setting `baseUrl` to `http://tools:3000`,
   `http://auth:3000`, or `http://169.254.169.254` is rejected at
   `PUT /assistant/provider` (allowlist/opt-in), while the server-default
   Ollama endpoint and a hosted Anthropic key both still work end-to-end.
2. A non-Anthropic upstream failure no longer returns the upstream response
   body / provider error text to the caller (oracle closed).
3. On a single host, dev and `deploy/docker-compose.yml` work unchanged with no
   new manual steps when custom endpoints are not used.
4. `contracts/assistant.openapi.yaml` documents the accepted-endpoint rule and
   the generic non-Anthropic error.
