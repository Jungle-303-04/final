# Member Guide: Workflow / RCA

## Mission

Own the event-driven business flow from Git change to command, RCA, audit, and Safe PR.

## Owned Areas

- `services/gitops-sync-worker`
- `services/command-worker`
- `services/rca-worker`
- `services/audit-timeline-service`
- Safe PR logic
- worker tests

## Current Responsibilities

- Replace fake Safe PR event with real GitHub branch/commit/PR client.
- Keep command flow sandbox-only.
- Add event contract tests for new subjects.
- Keep RCA output evidence-based.

## Coding Rules

- Workers subscribe through `EventHandlerSpec`.
- Workers publish through `EventClient`.
- Preserve `correlation_id`.
- Make handler writes idempotent or conflict-safe.
- Never ack/nak inside workflow code; runtime owns that.

## PR Checklist

- New event subject is in `EventSubject` and `docs/events.md`.
- New worker behavior has a unit test.
- No raw NATS usage in service workflow files.
- Safe PR side effects are guarded by token/ref and feature flag if needed.
- Audit/dashboard implications are documented.

## Codex Instruction

When working in this lane, read `docs/events.md`, `packages/worker_runtime/runtime.py`, and the target worker file before editing. Keep each handler small and event-driven.

