# Sprint: secure the inter-service trust hop (JWKS over the service network)

**Status:** planned (not started)
**Created:** 2026-07-09

## Why

The whole trust model between backend services rests on one HTTP call. The
`tools` service (and any future service) verifies access tokens by fetching the
`auth` service's public signing keys from
`GET /auth/.well-known/jwks.json` and trusting anything signed by them
(`services/tools/src/common/auth/auth.guard.ts`, ADR 0005/0006). That fetch is
plain **HTTP** to a Docker DNS name:

- dev: `http://localhost:3001/auth/.well-known/jwks.json`
- deploy: `http://auth:3000/auth/.well-known/jwks.json`
  (`deploy/docker-compose.yml`, `AUTH_JWKS_URL`)

On a single host this traffic never leaves the machine's bridge network, so the
plaintext hop is acceptable. But ADR 0006 split the services **specifically so
they can run on different hosts** over a swarm/overlay network — and there the
JWKS fetch crosses the wire. An attacker who can MITM or spoof DNS on that
network can serve their **own** JWK set; `jose`'s `createRemoteJWKSet` will
cache it and then happily verify tokens the attacker minted. That is full
authentication bypass for every service that trusts the JWKS.

This is not a bug today (single host) — it is a **constraint that must be
closed before any multi-host deployment**, and it is easy to forget precisely
because everything works fine on one box.

## Goal

Make the service-to-service trust hop safe to run across hosts, without
reintroducing shared secrets or coupling services at the code level (ADR 0006).
The browser-facing surface is out of scope — this is purely the internal
`tools -> auth` (and future `* -> auth`) key-distribution channel.

## Sketch (to be refined when the sprint starts)

Two independent layers; do the pinning first (cheap, host-agnostic), TLS second
(needed only when the hop leaves a single trusted host):

1. **Pin issuer + audience on verification (defense in depth, do regardless).**
   Today the guard only checks signature + `exp` + non-empty `sub`. Add
   `issuer` and `audience` to `jwtVerify` so a token is trusted only when it was
   minted *by auth* *for this service*, not merely "signed by that key." Auth
   stamps matching `iss`/`aud` at issuance. This shrinks the blast radius of a
   swapped key set but does **not** by itself stop a MITM who also forges those
   claims — hence step 2.

2. **Authenticate/encrypt the JWKS transport.** Options, cheapest first:
   - **TLS on the auth service** (or a sidecar) with the other services
     pinning the CA / trusting an internal CA only. `AUTH_JWKS_URL` becomes
     `https://auth:3000/...`. Simplest mental model; standard.
   - **mTLS on the overlay network** (e.g. swarm's encrypted overlay
     `--opt encrypted`, or a service mesh) so the hop is confidential without
     app changes. Keeps services ignorant of TLS but adds infra.
   - **Ship the public keys out-of-band** (bake the current JWKS / a trusted
     CA bundle into each service's config at deploy time) so no live fetch is
     trusted over the wire at all. Loses zero-downtime key rollover — weigh
     against the `kid`-refetch behavior we have now.

3. **Keep the `kid`-triggered refetch working** through whichever transport is
   chosen, so key rotation still needs no redeploy of the verifying services.

## Constraints

- No shared secrets between services and no cross-service imports (ADR 0006 #8).
  The fix must stay a transport/verification concern, not a code coupling.
- Do not regress local dev: plain `http://localhost` on a single host must keep
  working with zero extra setup. The secure path is for multi-host only and
  should be selected by config (`AUTH_JWKS_URL` scheme + env), not hardcoded.
- Any change to token claims (`iss`/`aud`) touches the auth token issuance, the
  guard in every consuming service, and the specs in `contracts/` — update them
  in the same change (see `CLAUDE.md`).
- Revisit ADR 0005/0006 rather than silently diverging from their trust model;
  if the transport story changes materially, record it (new ADR or amend 0006).

## Acceptance

1. On a single host, dev and `deploy/docker-compose.yml` work unchanged with no
   new manual steps.
2. In a two-host (overlay) deployment, the `tools -> auth` JWKS hop is
   confidential and authenticated: a process that can observe or intercept the
   overlay traffic cannot substitute its own JWK set and cannot get a
   self-signed token accepted by `tools`.
3. `tools` rejects a token whose `iss`/`aud` do not match, even when it is
   signed by a currently-trusted key (proves step 1 independently of transport).
4. Auth key rollover (new `kid`) is still picked up by `tools` without a
   redeploy, over the secured transport.
