# Member Guide: Platform / Integration

## Mission

Keep the whole system mergeable, testable, and demo-ready.

## Owned Areas

- `packages/shared`
- `packages/worker_runtime`
- `.github`
- `deploy`
- `scripts`
- `docs/events.md`
- `docs/team/conventions.md`

## Current Responsibilities

- Maintain `EventClient`, `EventHandlerSpec`, retry, DLQ, and replay contracts.
- Keep CI green and prevent broken PRs from merging.
- Maintain deployment scripts and Wednesday demo verification.
- Decide when the project needs outbox relay for DB/event atomicity.

## Coding Rules

- Use `Protocol` interfaces for replaceable infrastructure.
- Keep runtime error handling centralized in runtime/edge code.
- Do not let service workflows import raw NATS clients.
- Make constants explicit and named.
- Prefer small classes with one reason to change.

## PR Checklist

- `make check` passes.
- CI workflow remains required and green.
- New shared contract has at least one test.
- Docs explain any architecture/runtime change.
- No service owner behavior changed without coordination.

## Codex Instruction

When working in this lane, inspect `packages/shared`, `packages/worker_runtime`, `docs/events.md`, and `.github` before editing. Keep changes narrow and preserve every service's public contract.

