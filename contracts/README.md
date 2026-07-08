# Service contracts

OpenAPI 3.1 specs for every separately deployed ownTime service (ADR 0006).
These files are the **source of truth for inter-service HTTP**: a service may
only be called through what its spec declares, and a breaking change here is a
breaking change for every consumer — update the spec in the same PR as the
implementation.

| Spec | Service | Route prefixes | Owns |
|------|---------|----------------|------|
| `auth.openapi.yaml` | `services/auth` | `/auth`, `/preferences` | Users, sessions/JWKS, per-user preferences |
| `tools.openapi.yaml` | `services/tools` | `/todos`, `/scribe` | Todos, scribe notes (clock/stopwatch are client-side) |

The UI service (`services/ui`) has no spec: it exposes no API. Its
nginx proxies each route prefix above to the owning service over the internal
deploy network, so the browser sees a single origin.

## How services trust each other

There is no shared secret. The auth service signs access tokens with RS256 and
publishes the public keys at `GET /auth/.well-known/jwks.json`; every other
service verifies incoming `Authorization: Bearer` tokens against that JWKS
(fetched over the internal network, cached, refetched on unknown `kid`) and
scopes all data by the token's `sub` claim. Adding a new service requires no
key exchange — point `AUTH_JWKS_URL` at the auth service and go.

## Conventions

- All request/response bodies are JSON except scribe's PDF upload/download.
- Errors use the NestJS shape: `{ statusCode, message, error }`, where
  `message` is a string or an array of validation messages.
- IDs are cuids. All resources are user-scoped; a cross-user id looks like 404.
- Dev-only: with `AUTH_ALLOW_DEV_HEADER=true` and `NODE_ENV !== 'production'`,
  services accept `x-user-id: <id>` in place of a Bearer token.

## Viewing / validating

```bash
npx @redocly/cli preview-docs contracts/auth.openapi.yaml
npx @redocly/cli lint contracts/*.openapi.yaml
```
