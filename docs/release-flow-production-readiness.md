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

Required live control-plane runtime settings:

- `RELEASE_FLOW_LIVE_ENABLED=1`: enables live dispatch inside the management API.
- `RELEASE_FLOW_LIVE_WORKSPACES`: comma-separated workspace allow-list for live dispatch. Use the production workspace id; avoid `*` for production unless a separate environment control already scopes access.

Verify the GitHub Environment before running production workflows:

```bash
GITHUB_TOKEN="<token with repo/actions metadata access>" \
python scripts/verify_release_flow_github_environment.py \
  --github-repo owner/repo \
  --environment production \
  --github-token-env GITHUB_TOKEN
```

The verifier reads GitHub Environment secret names and variable values. It does not read secret values. It fails when required secret names are missing, when required variables/secrets are absent, when visible variables use unsafe values such as wildcard workspaces, or when the final GitHub access token secret is missing. Use `--allow-token-ref-only` only when the production runtime resolves `RELEASE_FLOW_GITHUB_TOKEN_REF` outside GitHub Actions and the final readiness run is intentionally not using GitHub API access preflight.

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
RELEASE_FLOW_LIVE_ENABLED=1 \
RELEASE_FLOW_LIVE_WORKSPACES="workspace-production" \
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

GitHub Environment configuration check, using a token that can read environment secrets and variables:

```bash
python scripts/verify_release_flow_github_environment.py \
  --github-repo owner/repo \
  --environment production \
  --github-token-env GITHUB_TOKEN \
  --report-path ./release-flow-github-environment.json
```

This check confirms the production environment exposes the required release-flow secrets, a concrete `RELEASE_FLOW_SCM_REPO`, live dispatch enabled, and an explicit non-wildcard `RELEASE_FLOW_LIVE_WORKSPACES` allow-list before operators run the workflow.

GitHub Actions production readiness:

1. Open **Actions**.
2. Run **Release Flow Production Readiness**.
3. Select the production GitHub Environment.
4. Keep `github_access_preflight` enabled for final production readiness so the workflow verifies the GitHub token can read `RELEASE_FLOW_SCM_REPO` and `RELEASE_FLOW_SCM_BASE_BRANCH` before Safe PR creation. Disable it only while bootstrapping secrets.
5. Keep `api_smoke_preflight` enabled for final production readiness so the workflow verifies the live API without dispatching a release. Disable it only while the API endpoint is being provisioned.
6. Keep `production_deploy_required` enabled for the final production-readiness run. Disable it only while wiring the first deployment workflow.
7. Confirm the workflow summary contains `Result: passed`.
8. Download the `release-flow-production-readiness` artifact and keep it with the release evidence.

If the operator token can dispatch workflows and read Actions artifacts, run the same production readiness path from a terminal and verify the readiness artifact in one command:

```bash
python scripts/run_release_flow_production_readiness.py \
  --github-repo owner/repo \
  --github-branch dev \
  --github-sha <production-commit-sha> \
  --github-token-env GITHUB_TOKEN \
  --environment production \
  --verify-artifact \
  --github-output-dir ./release-flow-production-evidence
```

Keep `--github-sha <production-commit-sha>` set for final sign-off so the workflow run and downloaded artifact prove the exact commit. The runner dispatches `release-flow-production-readiness.yml`, keeps `github_environment_preflight`, `github_access_preflight`, `api_smoke_preflight`, and `production_deploy_required` enabled by default, polls until the run completes, and then calls `verify_release_flow_production_evidence.py --allow-missing-deploy` against the readiness artifact.

For full production sign-off, run readiness, production deploy, and final evidence verification as one operator command:

```bash
python scripts/run_release_flow_production_signoff.py \
  --github-repo owner/repo \
  --github-branch dev \
  --github-sha <production-commit-sha> \
  --github-token-env GITHUB_TOKEN \
  --environment production \
  --release-plan-id <saved-production-plan-id> \
  --live-change-ticket <real-change-ticket> \
  --live-runbook-url https://ops.company.internal/runbooks/release-flow \
  --live-release-owner <release-owner> \
  --live-image ghcr.io/owner/app:<immutable-tag-or-digest> \
  --live-verification-url https://ops.company.internal/verify/release-flow \
  --live-safe-pr-workflow-run-id <safe-pr-workflow-run-id> \
  --live-safe-pr-url https://github.com/owner/repo/actions/runs/<safe-pr-workflow-run-id> \
  --github-output-dir ./release-flow-production-evidence \
  --signoff-report-path ./release-flow-production-evidence/release-flow-production-signoff.json
```

This full production sign-off runner dispatches `release-flow-production-readiness.yml` with every final gate enabled, verifies the readiness artifact while deploy evidence is still absent, dispatches `release-flow-production-deploy.yml`, waits for the deploy run to complete, and then runs `verify_release_flow_production_evidence.py` without any missing-artifact escape hatch. The verifier is pinned to the exact readiness and deploy workflow run ids returned by the runner, so final evidence cannot accidentally come from an older successful run for the same commit. On completion it writes `release-flow-production-signoff.json` with the exact commit, plan id, readiness run id, deploy run id, Safe PR evidence, and final evidence verification status.

By default the sign-off runner also checks that the local git `HEAD` matches `--github-sha` and that the selected GitHub branch currently points at the same SHA before dispatching any production workflow. Use `--skip-local-sha-check` only when running from a trusted tooling checkout that intentionally signs off a different production commit, and use `--skip-github-branch-sha-check` only when the dispatch ref is not a branch head but the exact SHA is otherwise independently pinned.

The runner also verifies the provided Safe PR GitHub Actions run before dispatching production workflows: `--live-safe-pr-url` must point at the same repo/run id as `--live-safe-pr-workflow-run-id`, the run must have concluded `success`, and its `head_sha` must match `--github-sha`. Add `--preflight-only` to perform these input, branch, Safe PR, and workflow-access checks without dispatching readiness or deploy workflows. A successful preflight writes `release-flow-production-preflight.json` under `--github-output-dir`, or to `--preflight-report-path` when set. Full sign-off requires a matching preflight report before dispatching production workflows and rejects it after `--preflight-report-max-age-minutes` (default 60) unless `--skip-preflight-report-check` is explicitly set for an emergency operator override.

When `github_access_preflight` is enabled, the verifier must have an actual GitHub token value. If `RELEASE_FLOW_GITHUB_TOKEN_REF` points to a non-env vault ref such as `aws-sm:` or `k8s-secret:`, also set the `RELEASE_FLOW_GITHUB_TOKEN` secret for this readiness workflow so the read-only GitHub API check can run.

`api_smoke_preflight` runs `scripts/release_flow_smoke.py --production-preflight --ci`. It verifies health, readiness, login, release plan APIs, generated manifest rendering, and existing release-run hygiene without starting a production release. The smoke result is appended to the GitHub Actions job summary when available and uploaded as `release-flow-smoke.md` in the readiness artifact.

## Live Gate Requirement

Production deployment workflows must call `.github/workflows/release-flow-production-gate.yml` before any write. The provided `.github/workflows/release-flow-production-deploy.yml` workflow does this before starting a saved release plan through `scripts/release_flow_deploy.py`. The deploy script rechecks the saved plan before calling `/release-plans/start`; it rejects demo runtime mode, non-production steps, placeholder tickets, non-HTTPS or example-host runbook/verification URLs, mutable `:latest` images, plan id mismatches, and saved plan evidence that differs from the gated workflow inputs.

The gate must pass with:

- a real `live_change_ticket`
- a real HTTPS `live_runbook_url`
- `live_release_owner` or `live_oncall_contact`
- a real HTTPS `live_verification_url`
- `live_approval_gate: safe_pr`
- concrete `live_safe_pr_workflow_run_id`
- concrete HTTPS `live_safe_pr_url` pointing at the real Safe PR
- a non-placeholder `live_image`

The gate rejects placeholder values such as `CHG-PREFLIGHT`, `localhost`, `example.com`, `release-operator`, and `release-oncall@example.com`.

After the gate passes, `release-flow-production-deploy.yml` runs `scripts/release_flow_deploy.py`. The script fetches the saved `release_plan_id`, refuses demo or non-production plans, and starts the release through `POST /release-plans/start` so the backend live blockers still run at dispatch time.

The production deploy workflow pins Python with `actions/setup-python@v5` before running the deploy script. Treat a failed setup step as an environment problem, not as release approval.

## Evidence Verification

After the final readiness and production deploy workflows finish, download the relevant GitHub Actions artifacts and verify them locally:

```bash
python scripts/verify_release_flow_production_evidence.py \
  ./release-flow-production-readiness \
  ./release-flow-smoke-production \
  ./release-flow-production-deploy
```

The verifier accepts extracted artifact directories, individual JSON reports, or artifact ZIP files. It fails unless the readiness report passed with runtime config, GitHub access, API smoke, and deploy-gate checks; the GitHub Environment report passed with the required release-flow secret and variable checks; the smoke report passed the production preflight checks; and the deploy report recorded a successful `release-plans.start.production` run id against a concrete HTTPS API URL. When `--require-signoff-report` is used for final sign-off, keep both `release-flow-production-signoff.json` and `release-flow-production-preflight.json` in the evidence directory; the verifier checks that the sign-off report's preflight digest, branch, commit SHA, release plan id, and Safe PR run id match the included no-dispatch preflight artifact.

If the verifier has a GitHub token with Actions read access, it can fetch the successful workflow artifacts directly:

```bash
python scripts/verify_release_flow_production_evidence.py \
  --github-repo owner/repo \
  --github-branch dev \
  --github-sha <production-commit-sha> \
  --github-token-env GITHUB_TOKEN \
  --github-output-dir ./release-flow-production-evidence
```

This path requires successful `release-flow-production-readiness.yml` and `release-flow-production-deploy.yml` runs for the selected branch/SHA, downloads the required artifacts, and then applies the same JSON checks. The smoke and deploy reports must point at the same concrete HTTPS API base URL.
Keep `--github-sha` set for final production evidence so the downloaded artifacts prove the exact deployed commit. `--allow-latest-github-run` exists only for exploratory checks before final sign-off.
When verifying a known Actions execution directly, pass `--github-readiness-run-id <run-id>` and `--github-deploy-run-id <run-id>` so artifact download is bound to those exact workflow runs.
