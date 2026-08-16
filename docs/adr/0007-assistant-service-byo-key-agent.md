# ADR 0007: Assistant service — bring-your-own-key Claude agent

- Status: Accepted
- Date: 2026-07-18
- Deciders: gursewak22 (with Claude Code)
- Extends: ADR 0006 (this is the "third backend service" its revisit trigger
  anticipated). ADR 0005's trust model is unchanged; one deliberate exception
  to its "secrets live only in auth" stance is documented in decision #4.

## Context

Users want an AI helper inside the workspace: paste their own AI API key, then
ask it to work their todo list — e.g. "complete the feasible tasks" — with the
assistant doing what is genuinely doable as knowledge work (drafting, writing,
planning), marking those todos done, and skipping the rest with a reason.
Later, external apps should be connectable as extra capabilities (MCP).

This is a new bounded context (an AI orchestrator holding a user secret), not a
new tool inside the tools service, so it becomes the fourth deployable.

## Decision summary

| # | Area | Decision |
|---|------|----------|
| 1 | Shape | New backend service `services/assistant` (NestJS + Prisma + own Postgres), copied from the tools-service scaffold per ADR 0006 #8; owns the `/assistant` route prefix |
| 2 | Provider | Anthropic only for v1 (`@anthropic-ai/sdk`, model `claude-opus-4-8`); the agent loop uses the SDK's tool runner |
| 3 | Acting on todos | The agent calls the **tools service over HTTP** per `contracts/tools.openapi.yaml`, forwarding the *user's own credential* (Bearer token or dev header) — no service account, no cross-service DB access |
| 4 | Key storage | Users' Anthropic API keys are encrypted at rest with AES-256-GCM under `ASSISTANT_KEY_SECRET` (env); only a masked hint is ever returned over HTTP |
| 5 | Chat | Conversation history persists per user in the assistant DB (`ChatMessage`); an exchange is only persisted after a successful agent run |
| 6 | MCP | Designed-for, not built: tools are an internal registry in `agent.service.ts`; MCP servers would append tools there and add a registry table — no rework of the loop |

## Decisions in detail

### 3. The agent acts as the user

The assistant service holds no credential of its own. Whatever credential the
`POST /assistant/chat` request arrived with is forwarded verbatim on every
tools-service call, so the agent can do exactly what the user could do and
nothing more, and the tools service needs no changes to authorize it. The cost:
access tokens live 5 minutes, so a very long agent run can see its forwarded
token expire mid-run — acceptable for v1 (tool calls then fail, the model
reports it, the user retries). Revisit trigger: agent runs regularly exceed the
token TTL → introduce short-lived service-to-service tokens (a new ADR).

### 4. Key encryption — a deliberate exception to "secrets live in auth"

ADR 0005 kept signing secrets out of non-auth services. The assistant service
necessarily holds user secrets (their API keys), so it gets a symmetric secret
of its own: `ASSISTANT_KEY_SECRET`, from which the AES-256-GCM cipher key is
derived (sha256). Stored form is `base64(iv | authTag | ciphertext)` in the
`AssistantKey` row. The auth service's generic preferences store was rejected
for this: preference values are readable JSON returned to the browser.
Rotating the secret orphans stored keys (users re-enter them) — fine at this
scale; envelope encryption/KMS is the upgrade path if that ever hurts.

### 6. MCP readiness

The agent's tool set is built per-request in one place (`buildTools`). Adding
MCP later means: a `McpServer` table (url, name, per-user auth), fetching the
server's tool list, namespacing (`servername_toolname`), and appending to the
same array — the loop, chat surface, and contracts don't change shape. Safety
work (per-tool confirmation, allowlists) rides that future PR.

## Consequences

- Deploy grows an `assistant` + `assistant-db` pair; the UI proxies
  `/assistant` (nginx gets a 300s read timeout there — agent runs are slow).
- The assistant service makes outbound internet calls (api.anthropic.com) —
  the only backend that does. Egress rules must allow it.
- Local dev ports: assistant on :3003, its Postgres on :5435.
- If sprint 0002 (JWKS hardening, `iss`/`aud` pinning) lands, the assistant's
  guard must be updated together with the tools service's.

## Addendum (2026-07-18): server-default local model via Ollama

Decision #2's bring-your-own-key onboarding is now optional. The service reads
an env-level default endpoint — `ASSISTANT_DEFAULT_BASE_URL` +
`ASSISTANT_DEFAULT_MODEL`, both required to activate — used for any user with
no stored provider config. Deploys point it at an Ollama instance on the
docker host (Ollama speaks the Anthropic Messages API), so the assistant works
with zero per-user setup and prompts never leave the machine. A user's own
key/endpoint saved via `/assistant/provider` still overrides the default, and
clearing both env values restores strict BYO-key behavior.

`ProviderStatus` gained a `serverDefault` field (see
`contracts/assistant.openapi.yaml`) so the UI can say which model is in use.
The outbound-internet consequence above now applies only when a user brings a
hosted API key.

## Addendum (2026-07-19): Scribe as an output surface

Per decision #6 (MCP readiness — the tool set is one internal registry), the
agent gained Scribe tools alongside the todo tools: `list_scribe_notes`,
`create_scribe_note`, and `append_to_scribe_note`. They call the **tools
service's** existing `/scribe/notes` API with the user's forwarded credential
(no new contract surface — the assistant's own routes are unchanged). The agent
writes content as Markdown, which the assistant converts to the TipTap/
ProseMirror doc Scribe stores (`services/assistant/src/services/chat/
markdown-to-doc.ts`, the inverse of the UI's `docToMarkdown` export, covering
the same StarterKit subset). This lets the user say "save that to a note"
instead of only receiving chat text. No new secret, DB, or egress is involved.
