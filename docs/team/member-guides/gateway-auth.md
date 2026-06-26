# Member Guide: Gateway / Auth

## Mission

Own the external HTTP boundary and make every outside request safe, authenticated, and event-driven.

## Owned Areas

- `services/management-api-gateway`
- `packages/shared/schemas.py`
- OAuth/session/token vault flow
- command/dashboard/dead-letter HTTP routes

## Current Responsibilities

- Replace fake GitHub OAuth with real provider token exchange.
- Keep sessions in Redis and token references in Token Vault records.
- Ensure UI command requests require a valid session.
- Keep external input validated with Pydantic.

## Coding Rules

- Gateway is the only external HTTP boundary.
- Do not let UI call DB, JetStream, or workers directly.
- Do not put provider access tokens in event payloads.
- Route handlers should validate input, call auth/policy, then publish an event.
- Add schemas before adding request payload fields.

## PR Checklist

- New endpoint has auth behavior documented.
- New request schema rejects unknown or unsafe fields.
- `make check` passes.
- Gateway smoke path still works.
- WIKI/API docs updated if a UI-visible route changed.

## Codex Instruction

When working in this lane, read `services/management-api-gateway/gateway.py`, `services/management-api-gateway/auth.py`, `packages/shared/schemas.py`, and `docs/team/conventions.md` first.

