# Member Guide: Dashboard / Docs

## Mission

Own the operator-facing experience, read model interpretation, weekly demo script, and WIKI alignment.

## Owned Areas

- dashboard UI folder when added
- `services/dashboard-projection-service`
- dashboard query/stream/command UX
- DLQ/audit UI
- WIKI project docs

## Current Responsibilities

- Build minimal dashboard UI using Gateway APIs only.
- Show command status, RCA/Safe PR status, audit timeline, and DLQ status.
- Maintain weekly Wednesday demo script.
- Keep WIKI aligned with code commits.

## Coding Rules

- UI must call Gateway only.
- UI must not read DB, JetStream, or target cluster directly.
- Dashboard projection should stay a read model, not source-of-truth storage.
- Display text should be short, operational, and status-focused.
- Docs must mention exact commands and exact dates.

## PR Checklist

- UI route/API dependency documented.
- Dashboard state maps to existing event subjects.
- Demo script updated if flow changed.
- WIKI links pass `make check`.
- Screens or curl fallback exists for Wednesday demo.

## Codex Instruction

When working in this lane, read `services/dashboard-projection-service/dashboard_projection.py`, Gateway dashboard routes, WIKI `projects/final/wbs.md`, and `docs/team/conventions.md` first.

