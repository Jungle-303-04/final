from __future__ import annotations

import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT_DIR / "docs"
FRONTEND_DOCS_DIR = ROOT_DIR / "frontend" / "docs"
FRONTEND_SCRIPTS_DIR = ROOT_DIR / "frontend" / "scripts"


def read(path: str) -> str:
    return (ROOT_DIR / path).read_text(encoding="utf-8")


def test_docs_do_not_exceed_three_levels_from_repo_root() -> None:
    too_deep = [
        str(path.relative_to(ROOT_DIR))
        for path in DOCS_DIR.rglob("*")
        if path.is_file() and len(path.relative_to(ROOT_DIR).parts) > 4
    ]

    assert too_deep == []


def test_all_markdown_docs_are_linked_from_docs_root() -> None:
    index = (DOCS_DIR / "README.md").read_text(encoding="utf-8")
    missing = []

    for path in sorted(DOCS_DIR.rglob("*.md")):
        rel = path.relative_to(DOCS_DIR).as_posix()
        if rel == "README.md":
            continue
        if f"({rel})" not in index:
            missing.append(rel)

    assert missing == []


def test_docs_do_not_reference_removed_local_kind_recovery_logs() -> None:
    removed_names = (
        "demo-recovery-2026-07-01",
        "dev-branch-error-audit-2026-07-01",
    )

    offenders = []
    for path in DOCS_DIR.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        if any(name in text for name in removed_names):
            offenders.append(path.relative_to(ROOT_DIR).as_posix())

    assert offenders == []


def test_docs_and_api_do_not_use_retired_scope_or_stale_language() -> None:
    blocked_terms = (
        "Plu" + "ral",
        "plu" + "ral",
        "05-" + "plu" + "ral" + "-production-comparison",
        "아" + "직 없음",
        "미" + "구현",
        "stale" + " fa" + "ke",
        "fa" + "ke" + " telemetry",
        "kind" + "-management",
        "kind" + "-target",
        "VITE_API_MODE",
        "API_MODE",
        "mo" + "ckRequest",
        "shared/lib/mo" + "ck",
        "mo" + "ck fallback",
        "mo" + "ck 모드",
        "MO" + "CK 뱃지",
    )

    checked_paths = [ROOT_DIR / "README.md"]
    checked_paths.extend(DOCS_DIR.rglob("*.md"))
    checked_paths.extend(FRONTEND_DOCS_DIR.rglob("*.md"))
    checked_paths.extend(FRONTEND_SCRIPTS_DIR.rglob("*.ts"))
    checked_paths.extend((DOCS_DIR / "api").rglob("*.bru"))
    checked_paths.extend((DOCS_DIR / "api").rglob("*.json"))

    offenders = []
    for path in sorted(checked_paths):
        text = path.read_text(encoding="utf-8")
        found = [term for term in blocked_terms if term in text]
        if found:
            offenders.append(f"{path.relative_to(ROOT_DIR).as_posix()}: {', '.join(found)}")

    assert offenders == []


def test_onboarding_declares_benchmark_minimum_as_production_scope() -> None:
    docs = {
        "docs/README.md": read("docs/README.md"),
        "docs/onboarding/README.md": read("docs/onboarding/README.md"),
        "docs/production-readiness.md": read("docs/production-readiness.md"),
        "docs/rca-production-onboarding/README.md": read(
            "docs/rca-production-onboarding/README.md"
        ),
        "docs/rca-production-onboarding/05-production-completion-scope.md": read(
            "docs/rca-production-onboarding/05-production-completion-scope.md"
        ),
    }

    for path, text in docs.items():
        assert "벤치마크" in text, path
        assert "프로덕션" in text, path


def test_completion_scope_mentions_every_required_feature_domain_and_owner() -> None:
    text = read("docs/rca-production-onboarding/05-production-completion-scope.md")
    required_terms = [
        "Account/User/Auth",
        "Group/Role/RBAC",
        "OIDC/OAuth/Auth Proxy",
        "Fleet Cluster",
        "GitOps Repository",
        "Helm/Kustomize/YAML Deploy",
        "Terraform/IaC",
        "Upgrade Queue / Deferred Update",
        "Rollout",
        "Test / Test Logs",
        "Dependency / Scan / Vulnerability",
        "Incident / Message / Postmortem",
        "AI Insight / Chat / Help",
        "Automated PR Generation",
        "Notification / Email / Digest",
        "DNS",
        "Shell / Demo Project",
        "Billing/License/Plan",
        "Marketplace/Publisher",
        "Realtime Subscription",
        "민정",
        "가인",
        "찬빈",
    ]

    missing = [term for term in required_terms if term not in text]

    assert missing == []


def test_each_member_onboarding_has_production_completion_section() -> None:
    member_docs = [
        "docs/onboarding/minjeong-command-target-evidence.md",
        "docs/onboarding/gain-evidence-rca.md",
        "docs/onboarding/chanbin-frontend.md",
    ]

    missing = []
    for path in member_docs:
        text = read(path)
        if "## 프로덕션 완료 기준" not in text:
            missing.append(path)
        if "벤치마크 최소선 기준 프로덕션 완성 설계" not in text:
            missing.append(f"{path}: completion-scope-link")

    assert missing == []


def test_step_by_step_onboarding_docs_avoid_markdown_tables() -> None:
    checked_docs = [
        "docs/README.md",
        "docs/api/README.md",
        "docs/onboarding/README.md",
        "docs/onboarding/minjeong-command-target-evidence.md",
        "docs/onboarding/gain-evidence-rca.md",
        "docs/onboarding/chanbin-frontend.md",
        "docs/rca-production-onboarding/README.md",
        "docs/rca-production-onboarding/01-minjeong-command-target-evidence.md",
        "docs/rca-production-onboarding/02-gain-evidence-rca-safe-pr.md",
        "docs/rca-production-onboarding/03-chanbin-frontend-projection.md",
        "docs/rca-production-onboarding/05-production-completion-scope.md",
    ]

    offenders: list[str] = []
    for path in checked_docs:
        for line_number, line in enumerate(read(path).splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("|") and stripped.endswith("|"):
                offenders.append(f"{path}:{line_number}")

    assert offenders == []


def test_docs_root_keeps_keyword_wiki_entrypoints() -> None:
    index = read("docs/README.md")
    required_keywords = [
        "`command`",
        "`target`",
        "`evidence`",
        "`RCA`",
        "`Safe PR`",
        "`dashboard`",
        "`permission`",
        "`Bruno`",
        "`AWS`",
        "`event`",
        "`provider`",
        "`worker`",
        "`test`",
        "`GitOps`",
        "`realtime`",
    ]

    missing = [keyword for keyword in required_keywords if keyword not in index]

    assert missing == []


def test_backend_coordination_docs_use_declared_states_and_keep_morning_summary() -> None:
    workqueue = read("docs/backend-f-workqueue.md")
    allowed_states = {
        "requested",
        "in_progress",
        "completed",
        "blocked",
        "landed",
        "done-pending-merge",
    }
    invalid_states = []
    for line in workqueue.splitlines():
        if not line.startswith("| BQ-"):
            continue
        columns = [column.strip() for column in line.strip("|").split("|")]
        if columns[1] not in allowed_states:
            invalid_states.append(f"{columns[0]}={columns[1]}")

    night_log = read("docs/auto/night-log.md")
    morning_summaries = re.findall(
        r"^## \d{4}-\d{2}-\d{2} \d{2}:\d{2} KST — \[백엔드\] 아침 요약$",
        night_log,
        flags=re.MULTILINE,
    )

    assert invalid_states == []
    assert morning_summaries


def test_backend_progress_anchor_count_matches_anchor_lines() -> None:
    progress = read("docs/backend-f-progress.md")
    declared_count = re.search(r"현재 상태: \*\*앵커 (\d+)건\*\*", progress)
    anchor_lines = [line for line in progress.splitlines() if line.startswith("계약 완성:")]

    assert declared_count is not None
    assert int(declared_count.group(1)) == len(anchor_lines)
