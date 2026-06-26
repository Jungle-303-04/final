# Team Conventions

This document is the shared rulebook for code style, branch naming, pull requests, review, and CI.

## Source Of Truth

- Product/WBS source: `WIKI/projects/final`.
- Runnable source: this repository.
- Architecture source: `docs/architecture.md`, `docs/events.md`, `docs/service-split-plan.md`.
- If code and docs disagree, update docs in the same PR.

## Five-Person Ownership

| Role | Primary folders | Primary docs |
| --- | --- | --- |
| Platform/Integration | `packages/shared`, `packages/worker_runtime`, `deploy`, `scripts`, `.github` | `docs/events.md`, `docs/team/conventions.md` |
| Gateway/Auth | `services/management-api-gateway`, `packages/shared/schemas.py` | `docs/team/member-guides/gateway-auth.md` |
| Workflow/RCA | `services/gitops-sync-worker`, `services/command-worker`, `services/rca-worker`, `services/audit-timeline-service` | `docs/events.md`, `docs/team/member-guides/workflow-rca.md` |
| Target/Telemetry | `services/target-cluster-agent`, `services/node-collector`, `deploy/target` | `docs/team/member-guides/target-telemetry.md` |
| Dashboard/Docs | dashboard UI folder when added, `services/dashboard-projection-service`, WIKI docs | `docs/team/member-guides/dashboard-docs.md` |

## Branch Rules

Use short-lived branches.

```text
feat/<owner>/<topic>
fix/<owner>/<topic>
docs/<owner>/<topic>
ci/<owner>/<topic>
refactor/<owner>/<topic>
```

Examples:

```text
feat/gateway/github-oauth
feat/workflow/safe-pr-client
feat/target/prometheus-adapter
docs/platform/wbs-update
ci/platform/pr-gate
```

Rules:

- `main` is protected and must not receive direct pushes.
- Work branches target `main` unless the team explicitly creates a temporary integration branch.
- Rebase or merge from `main` before requesting review if your branch is stale.
- Keep each PR focused on one ownership area or one vertical slice.

## Commit Rules

Use this format:

```text
type: short Korean summary
```

Allowed types:

- `feat`: new user-visible or runtime behavior
- `fix`: bug fix
- `refactor`: structure change without behavior change
- `docs`: documentation only
- `test`: tests only
- `ci`: GitHub Actions or automation
- `chore`: dependency or maintenance

Examples:

```text
feat: GitHub OAuth adapter 추가
fix: DLQ replay 중복 처리 방지
docs: 팀 PR 규칙과 역할 분배 추가
ci: PR 필수 검증 workflow 추가
```

## Python Code Style

- Prefer clear names over short names.
- Keep constants near the top of the file if only that file uses them.
- Put shared constants in `packages/shared/constants.py`.
- Use `Protocol` ports in `packages/shared/contracts.py` for replaceable boundaries.
- Keep service workflows dependent on ports, not concrete NATS/PostgreSQL clients.
- Use dataclasses for small immutable value objects.
- Avoid broad `except Exception` outside process boundaries. Runtime/process edge code may catch and convert to DLQ.
- Do not put secrets in events, logs, fixtures, docs, screenshots, or tests.

Naming:

| Item | Style | Example |
| --- | --- | --- |
| Module/file | `snake_case.py` | `gateway.py`, `node_collector.py` |
| Class | `PascalCase` | `CommandWorkflow`, `EventHandlerSpec` |
| Function/method | `snake_case` verb phrase | `publish_event`, `record_dead_letter` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_DEAD_LETTER_LIMIT` |
| Event subject | `<domain>.<thing>.<verb>` | `command.requested` |
| Service folder | kebab-case | `management-api-gateway` |

## Event Rules

- Publish through `EventClient`.
- Subscribe through `EventHandlerSpec`.
- Add new event subjects to `EventSubject` and `docs/events.md`.
- Each event payload must be a JSON object.
- Each business flow must preserve `correlation_id`.
- Handler writes must be idempotent or safe for at-least-once delivery.
- A handler must finish local work before ack; `WorkerRuntime` owns ack/nak/DLQ.

## API Rules

- Gateway owns external HTTP.
- Workers do not expose HTTP routes.
- UI calls Gateway only.
- Request/response validation uses Pydantic schemas.
- Write commands must pass auth and policy checks.
- Production namespace write is forbidden until the team explicitly changes the policy.

## Testing Rules

Before opening PR:

```bash
make check
python3 -m py_compile $(find services packages -name '*.py' -print)
```

Before a Wednesday demo:

```bash
make build-image
make up
make smoke
make status
```

PR cannot merge unless GitHub Actions CI passes.

Required GitHub branch protection for `main`:

- Require a pull request before merging.
- Require at least 1 approval.
- Require status checks to pass.
- Required checks:
  - `Python lint and tests`
  - `Kubernetes manifest and image checks`
- Require conversation resolution before merging.
- Block force pushes.
- Block branch deletion.

## PR Rules

Every PR must include:

- What changed
- Why it changed
- How to test
- Risk/rollback note
- WIKI/docs update note when architecture, workflow, API, or schedule changed

Merge criteria:

- CI green
- At least one human review
- No unrelated files
- No raw secrets
- Tests added or updated for behavior changes
- Relevant member guide checklist satisfied

## Review Rules

Reviewers should block PRs for:

- broken CI
- missing tests for changed behavior
- event subject added without docs
- worker directly using raw NATS instead of `EventClient`
- HTTP route added outside Gateway
- target write outside `sandbox`
- secrets committed or logged
- docs/WIKI not updated for architecture changes
