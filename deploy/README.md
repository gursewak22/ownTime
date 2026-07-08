# Deploying ownTime

ownTime ships as three independently deployable services (ADR 0006):

| Service | Image source | Talks to | Exposed |
|---------|-------------|----------|---------|
| `ui` | `services/ui` (nginx) | auth + tools over the internal network | **yes** — the only published port |
| `auth` | `services/auth` | its own Postgres | no |
| `tools` | `services/tools` | its own Postgres; auth (JWKS) | no |

The browser only ever sees the UI origin. nginx inside the UI container proxies
`/auth` + `/preferences` to the auth service and `/todos` + `/scribe` to the
tools service; the tools service verifies access tokens by fetching the auth
service's JWKS. All of that traffic stays on the internal Docker network.

## Single-host (docker compose)

```bash
cd deploy
cp .env.example .env    # set GOOGLE_CLIENT_ID + AUTH_JWT_PRIVATE_KEY
docker compose up -d --build
open http://localhost:8080
```

Each backend applies its own Prisma migrations on boot (`prisma migrate
deploy`), so first start needs no manual DB step.

## Multi-host (swarm / overlay network)

The services were split exactly so they can run on different hosts. On swarm:

```bash
docker network create --driver overlay --attachable owntime_net
```

then mark the network external in `docker-compose.yml`:

```yaml
networks:
  owntime_net:
    external: true
```

and deploy with `docker stack deploy` (or run compose per host attached to the
same overlay network). Service discovery keeps working because everything
addresses `auth`, `tools`, `auth-db`, `tools-db` by Docker DNS name — nothing
crosses the public internet except the UI's published port.

## Things that bite

- **HTTPS**: `AUTH_COOKIE_SECURE=true` (the production default) makes the
  refresh cookie HTTPS-only — login silently fails over plain HTTP. Set it to
  `false` only for private/LAN deployments without TLS.
- **`PUBLIC_ORIGIN`** must be exactly what the browser shows (scheme + host +
  port) — it is both the CORS allowlist and the CSRF Origin check on
  `/auth/refresh` and `/auth/logout`.
- **Google OAuth**: add `PUBLIC_ORIGIN` to the OAuth client's authorized
  JavaScript origins in Google Cloud Console.
- **Scaling `auth` past one replica** needs a shared throttler store (the rate
  limiter is in-memory per instance — see the note in `auth.module.ts`).
- The dev `x-user-id` header is dead here: `NODE_ENV=production` disables it
  unconditionally.
