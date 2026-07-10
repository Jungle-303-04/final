# Release Flow Production Readiness

This is the operator checklist for enabling the GitOps release flow against a real production control plane.

## Required GitHub Environment

Create or update the GitHub Environment used by `.github/workflows/release-flow-production-readiness.yml`. The default environment name is `production`.

Required secrets:

- `RELEASE_FLOW_API_BASE_URL`: HTTPS API base URL for the live management gateway, for example `https://ops.company.internal/api`.
- `RELEASE_FLOW_AUTH_EMAIL`: real operator account used by the readiness smoke.
- `RELEASE_FLOW_AUTH_PASSWORD`: non-placeholder password or token for that account.
- `RELEASE_FLOW_GITHUB_TOKEN_REF` or `RELEASE_FLOW_GITHUB_TOKEN`: token source for the Safe PR provider. Prefer `RELEASE_FLOW_GITHUB_TOKEN_REF` when the runtime can resolve a vault reference.

Required variable or secret:

- `RELEASE_FLOW_SCM_REPO`: production GitHub repository in `owner/repo` form.

Optional variable or secret:

- `RELEASE_FLOW_SCM_BASE_BRANCH`: Safe PR base branch to verify and use. Omit it for `main`.
- `RELEASE_FLOW_GITHUB_API_BASE`: GitHub Enterprise API base URL. Omit it for `https://api.github.com`.

## Preflight Commands

Local static wiring check:

```bash
python scripts/validate_release_flow_production_readiness.py
```

Local runtime contract check, using the same names the workflow maps into the verifier:

```bash
RELEASE_FLOW_API_BASE_URL="https://ops.company.internal/api" \
RELEASE_FLOW_AUTH_EMAIL="release-operator@company.internal" \
RELEASE_FLOW_AUTH_PASSWORD="<real secret>" \
GITHUB_TOKEN_REF="aws-sm:/myjob/prod/github-token#token" \
SCM_REPO="owner/repo" \
python scripts/validate_release_flow_production_readiness.py --require-runtime-config
```

Local read-only GitHub access check, using a token value that the verifier can resolve locally:

```bash
RELEASE_FLOW_API_BASE_URL="https://ops.company.internal/api" \
RELEASE_FLOW_AUTH_EMAIL="release-operator@company.internal" \
RELEASE_FLOW_AUTH_PASSWORD="<real secret>" \
GITHUB_TOKEN="<real GitHub token or app installation token>" \
SCM_REPO="owner/repo" \
SCM_BASE_BRANCH="main" \
python scripts/validate_release_flow_production_readiness.py \
  --require-runtime-config \
  --check-github-access
```

GitHub Actions production readiness:

1. Open **Actions**.
2. Run **Release Flow Production Readiness**.
3. Select the production GitHub Environment.
4. Enable `github_access_preflight` when you want the workflow to verify the GitHub token can read `RELEASE_FLOW_SCM_REPO` and `RELEASE_FLOW_SCM_BASE_BRANCH` before Safe PR creation.
5. Enable `api_smoke_preflight` when you want the workflow to verify the live API without dispatching a release.
6. Confirm the workflow summary contains `Result: passed`.
7. Download the `release-flow-production-readiness` artifact and keep it with the release evidence.

`api_smoke_preflight` runs `scripts/release_flow_smoke.py --production-preflight --ci`. It verifies health, readiness, login, release plan APIs, generated manifest rendering, and existing release-run hygiene without starting a production release.

## Live Gate Requirement

Production deployment workflows must call `.github/workflows/release-flow-production-gate.yml` before any write. The gate must pass with:

- a real `live_change_ticket`
- a real `live_runbook_url`
- `live_release_owner` or `live_oncall_contact`
- `live_approval_gate: safe_pr`
- concrete `live_safe_pr_workflow_run_id`
- concrete `live_safe_pr_url`

The gate rejects placeholder values such as `CHG-PREFLIGHT`, `example.com`, `release-operator`, and `release-oncall@example.com`.
