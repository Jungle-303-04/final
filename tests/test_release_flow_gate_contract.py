from __future__ import annotations

from pathlib import Path
from textwrap import dedent

from scripts.validate_release_flow_production_gate import main, validate_workflows


def write_workflow(path: Path, body: str) -> Path:
    path.write_text(dedent(body).strip() + "\n", encoding="utf-8")
    return path


def test_current_workflows_pass_release_flow_gate_contract() -> None:
    result = validate_workflows([Path(".github/workflows")])

    assert result.ok


def test_valid_production_deploy_requires_release_flow_gate(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          release_flow_production_gate:
            uses: ./.github/workflows/release-flow-production-gate.yml
            with:
              live_change_ticket: ${{ inputs.change_ticket }}
              live_runbook_url: ${{ inputs.runbook_url }}
              live_release_owner: ${{ inputs.release_owner }}
              live_image: ${{ inputs.image }}
              live_verification_url: ${{ inputs.verification_url }}
              live_safe_pr_workflow_run_id: ${{ inputs.safe_pr_workflow_run_id }}
              live_safe_pr_url: ${{ inputs.safe_pr_url }}
            secrets: inherit
          deploy-production:
            name: Deploy production
            runs-on: ubuntu-latest
            needs: release_flow_production_gate
            if: needs.release_flow_production_gate.outputs.release_gate_ok == 'true'
            steps:
              - run: ./scripts/deploy-production.sh
        """,
    )

    result = validate_workflows([workflow])

    assert result.ok
    assert [candidate.job_id for candidate in result.candidates] == ["deploy-production"]


def test_ungated_production_deploy_is_rejected(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          deploy-production:
            name: Deploy production
            runs-on: ubuntu-latest
            steps:
              - run: ./scripts/deploy-production.sh
        """,
    )

    result = validate_workflows([workflow])

    assert not result.ok
    assert result.candidates[0].job_id == "deploy-production"
    messages = "\n".join(violation.message for violation in result.violations)
    assert "no sibling job calling release-flow-production-gate.yml" in messages
    assert "release_gate_ok" in messages


def test_production_deploy_without_gate_success_condition_is_rejected(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          release_flow_production_gate:
            uses: ./.github/workflows/release-flow-production-gate.yml
            with:
              live_change_ticket: ${{ inputs.change_ticket }}
              live_runbook_url: ${{ inputs.runbook_url }}
              live_oncall_contact: ${{ inputs.oncall_contact }}
              live_image: ${{ inputs.image }}
              live_verification_url: ${{ inputs.verification_url }}
              live_safe_pr_workflow_run_id: ${{ inputs.safe_pr_workflow_run_id }}
              live_safe_pr_url: ${{ inputs.safe_pr_url }}
            secrets: inherit
          deploy-production:
            name: Deploy production
            runs-on: ubuntu-latest
            needs: release_flow_production_gate
            steps:
              - run: ./scripts/deploy-production.sh
        """,
    )

    result = validate_workflows([workflow])

    assert not result.ok
    assert len(result.violations) == 1
    assert "release_gate_ok" in result.violations[0].message


def test_production_deploy_needing_wrong_job_is_rejected(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          release_flow_production_gate:
            uses: ./.github/workflows/release-flow-production-gate.yml
            with:
              live_change_ticket: ${{ inputs.change_ticket }}
              live_runbook_url: ${{ inputs.runbook_url }}
              live_release_owner: ${{ inputs.release_owner }}
              live_image: ${{ inputs.image }}
              live_verification_url: ${{ inputs.verification_url }}
              live_safe_pr_workflow_run_id: ${{ inputs.safe_pr_workflow_run_id }}
              live_safe_pr_url: ${{ inputs.safe_pr_url }}
            secrets: inherit
          build:
            runs-on: ubuntu-latest
            steps:
              - run: echo build
          deploy-production:
            name: Deploy production
            runs-on: ubuntu-latest
            needs: build
            if: needs.build.outputs.release_gate_ok == 'true'
            steps:
              - run: ./scripts/deploy-production.sh
        """,
    )

    result = validate_workflows([workflow])

    assert not result.ok
    assert any(
        "must need one of the release-flow gate jobs" in item.message for item in result.violations
    )


def test_cli_returns_failure_for_contract_violation(tmp_path: Path, capsys) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          deploy-production:
            runs-on: ubuntu-latest
            environment: production
            steps:
              - run: echo deploy
        """,
    )

    exit_code = main([str(workflow)])

    assert exit_code == 1
    captured = capsys.readouterr()
    assert "production deploy candidates" in captured.out
    assert "release-flow production gate violations" in captured.err


def test_product_deploy_name_is_not_treated_as_production(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-product-catalog.yml",
        """
        name: Product Catalog Deploy
        "on":
          workflow_dispatch:
        jobs:
          deploy-product-catalog:
            name: Deploy product catalog
            runs-on: ubuntu-latest
            steps:
              - run: echo deploy product catalog
        """,
    )

    result = validate_workflows([workflow])

    assert result.ok
    assert result.candidates == []


def test_gate_job_missing_required_live_inputs_is_rejected(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          release_flow_production_gate:
            uses: ./.github/workflows/release-flow-production-gate.yml
            secrets: inherit
          deploy-production:
            name: Deploy production
            runs-on: ubuntu-latest
            needs: release_flow_production_gate
            if: needs.release_flow_production_gate.outputs.release_gate_ok == 'true'
            steps:
              - run: ./scripts/deploy-production.sh
        """,
    )

    result = validate_workflows([workflow])

    assert not result.ok
    messages = "\n".join(violation.message for violation in result.violations)
    assert "must pass live_change_ticket" in messages
    assert "must pass live_runbook_url" in messages
    assert "must pass live_image" in messages
    assert "must pass live_verification_url" in messages
    assert "must pass live_safe_pr_workflow_run_id" in messages
    assert "must pass live_safe_pr_url" in messages
    assert "must pass live_release_owner or live_oncall_contact" in messages


def test_gate_job_placeholder_live_inputs_are_rejected(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          release_flow_production_gate:
            uses: ./.github/workflows/release-flow-production-gate.yml
            with:
              live_change_ticket: CHG-PREFLIGHT
              live_runbook_url: https://example.com/runbooks/release-flow
              live_release_owner: release-operator
              live_oncall_contact: release-oncall@example.com
              live_image: ghcr.io/example/release-flow-smoke:live-preflight
              live_verification_url: https://example.com/verify/release-flow
              live_safe_pr_workflow_run_id: run-123
              live_safe_pr_url: https://example.com/org/repo/pull/7
            secrets: inherit
          deploy-production:
            name: Deploy production
            runs-on: ubuntu-latest
            needs: release_flow_production_gate
            if: needs.release_flow_production_gate.outputs.release_gate_ok == 'true'
            steps:
              - run: ./scripts/deploy-production.sh
        """,
    )

    result = validate_workflows([workflow])

    assert not result.ok
    messages = "\n".join(violation.message for violation in result.violations)
    assert "placeholder live_change_ticket" in messages
    assert "placeholder live_runbook_url" in messages
    assert "placeholder live_release_owner" in messages
    assert "placeholder live_oncall_contact" in messages
    assert "placeholder live_image" in messages
    assert "placeholder live_verification_url" in messages
    assert "placeholder live_safe_pr_url" in messages


def test_gate_job_literal_live_urls_must_be_real_https_targets(tmp_path: Path) -> None:
    workflow = write_workflow(
        tmp_path / "deploy-production.yml",
        """
        name: Production Deploy
        "on":
          workflow_dispatch:
        jobs:
          release_flow_production_gate:
            uses: ./.github/workflows/release-flow-production-gate.yml
            with:
              live_change_ticket: CHG-12345
              live_runbook_url: http://wiki.company.internal/runbooks/release-flow
              live_release_owner: platform-release
              live_image: ghcr.io/company/checkout-api:2.0.0
              live_verification_url: https://localhost/verify/release-flow
              live_safe_pr_workflow_run_id: run-123
              live_safe_pr_url: http://github.company.internal/org/repo/pull/7
            secrets: inherit
          deploy-production:
            name: Deploy production
            runs-on: ubuntu-latest
            needs: release_flow_production_gate
            if: needs.release_flow_production_gate.outputs.release_gate_ok == 'true'
            steps:
              - run: ./scripts/deploy-production.sh
        """,
    )

    result = validate_workflows([workflow])

    assert not result.ok
    messages = "\n".join(violation.message for violation in result.violations)
    assert "must pass https live_runbook_url" in messages
    assert "placeholder live_verification_url" in messages
    assert "must pass https live_safe_pr_url" in messages
