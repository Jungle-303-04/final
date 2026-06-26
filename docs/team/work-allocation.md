# Five-Person Work Allocation

This document maps the project into five clear ownership lanes. Each teammate can give their Codex instance the matching member guide as the operating instruction.

## Role Summary

| Person | Role | Main objective | First demo contribution |
| --- | --- | --- | --- |
| Member 1 | Platform/Integration | Keep event runtime, contracts, CI, deploy, and merges stable | CI gate, DLQ scenario, release-ready smoke |
| Member 2 | Gateway/Auth | Own all external HTTP, session, OAuth, command API, DLQ API | GitHub OAuth real adapter path |
| Member 3 | Workflow/RCA | Own GitOps, command workflow, RCA, Safe PR, audit | Safe PR client and event tests |
| Member 4 | Target/Telemetry | Own target agent, Kubernetes/RBAC, Prometheus/Loki/OTel, node collector | real telemetry evidence path |
| Member 5 | Dashboard/Docs | Own dashboard UI/read model/docs/demo script | query/stream/command UI and weekly demo script |

## Work Boundaries

| Role | Can change freely | Must coordinate before changing |
| --- | --- | --- |
| Platform/Integration | `packages/shared`, `packages/worker_runtime`, `.github`, `deploy`, `scripts` | service workflow behavior, UI routes |
| Gateway/Auth | `services/management-api-gateway`, auth/session schemas | event subjects, DB schema, target agent protocol |
| Workflow/RCA | worker services, RCA/Safe PR logic, audit timeline | Gateway routes, target RBAC, UI state model |
| Target/Telemetry | `services/target-cluster-agent`, `services/node-collector`, `deploy/target` | command payload schema, evidence schema, metrics storage |
| Dashboard/Docs | dashboard UI folder, dashboard projection, WIKI | event contract, API schema, deploy manifests |

## Current Gaps As Of 2026-06-26

| Gap | Owner | Notes |
| --- | --- | --- |
| Real GitHub OAuth token exchange | Gateway/Auth | Replace fake adapter while preserving Token Vault flow |
| Real GitHub PR creation | Workflow/RCA | Safe PR client should be feature-flagged |
| Prometheus/Loki real adapters | Target/Telemetry | Keep fake adapters as fallback |
| Dashboard UI | Dashboard/Docs | Use Gateway only: query, stream, command, DLQ |
| Outbox decision | Platform/Integration | Decide before real PR side effects become critical |
| Wednesday demo scripts | Dashboard/Docs + Platform | Every Wednesday must have runnable demo |

## Weekly Coordination

- Monday: assign PRs from WBS.
- Tuesday: integration freeze by evening.
- Wednesday morning: only demo rehearsal and critical fixes.
- Wednesday report: show a running demo, not only slides.
- Thursday/Friday: feature implementation.
- Weekend: documentation cleanup and integration risk reduction.

## Cross-Team Contract Rules

- New API route: Gateway/Auth opens PR and updates schema/docs.
- New event subject: owner opens PR and updates `EventSubject`, `docs/events.md`, tests.
- New DB table: owner updates `Database.init`, docs, and test coverage.
- New Kubernetes permission: Target/Telemetry opens PR and explains RBAC scope.
- New UI dependency on API: Dashboard/Docs adds API contract note first.

