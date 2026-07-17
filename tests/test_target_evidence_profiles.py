from __future__ import annotations

import pytest

from domains.target.evidence_policy import (
    DEMO_EVIDENCE_PROFILE,
    MANAGEMENT_EVIDENCE_PROFILE,
    STANDARD_EVIDENCE_PROFILE,
    default_agent_policy,
    evidence_profile_for_registration,
)
from packages.contracts.evidence_policy import (
    EvidencePolicyQuery,
    EvidenceQueryProvenance,
)
from packages.contracts.gateway.requests import AgentPolicy


def query_payloads(policy: AgentPolicy) -> list[dict[str, object]]:
    evidence = policy.evidence
    return [query for provider in evidence.providers.values() for query in provider.queries]


def test_standard_profile_excludes_demo_and_shared_unscoped_telemetry_queries() -> None:
    policy = default_agent_policy(cluster_id="customer-cluster")
    queries = query_payloads(policy)
    rendered = repr(queries).casefold()

    assert policy.evidence.profile == STANDARD_EVIDENCE_PROFILE
    assert "sandbox" not in rendered
    assert "color-turf" not in rendered
    assert "chaos.oom" not in rendered
    for query in queries:
        provenance = query["provenance"]
        assert provenance["cluster_id"] == "customer-cluster"
        if query["source"] in {"prometheus", "loki", "tempo"}:
            assert provenance["backend_scope"] == "cluster_local"
            assert all(matcher in query["query"] for matcher in provenance["required_matchers"])


def test_demo_profile_explicitly_adds_demo_namespace_evidence() -> None:
    policy = default_agent_policy(
        cluster_id="demo-cluster",
        evidence_profile=DEMO_EVIDENCE_PROFILE,
    )
    by_name = {query["name"]: query for query in query_payloads(policy)}

    assert policy.evidence.profile == DEMO_EVIDENCE_PROFILE
    assert by_name["sandbox_namespace_snapshot"]["query"] == "sandbox"
    assert by_name["color_turf_namespace_snapshot"]["query"] == "color-turf"
    assert 'namespace="color-turf"' in by_name["color_turf_pod_restarts"]["query"]
    assert 'k8s_namespace_name="sandbox"' in by_name["sandbox_namespace_errors"]["query"]


def test_management_profile_remains_kubernetes_only() -> None:
    policy = default_agent_policy(
        cluster_id="management-cluster",
        cluster_role="management",
    )

    assert policy.evidence.profile == MANAGEMENT_EVIDENCE_PROFILE
    assert {key for key, provider in policy.evidence.providers.items() if provider.enabled} == {
        "kubernetes"
    }
    assert {query["query"] for query in policy.evidence.providers["kubernetes"].queries} >= {
        "management",
        "*",
    }


@pytest.mark.parametrize(
    ("cluster_role", "environment", "install_sample_workload", "expected"),
    [
        ("target", "production", False, STANDARD_EVIDENCE_PROFILE),
        ("target", "sandbox", False, STANDARD_EVIDENCE_PROFILE),
        ("target", "test", False, DEMO_EVIDENCE_PROFILE),
        ("target", "aws-test", False, DEMO_EVIDENCE_PROFILE),
        ("target", "production", True, DEMO_EVIDENCE_PROFILE),
        ("management", "production", True, MANAGEMENT_EVIDENCE_PROFILE),
    ],
)
def test_registration_profile_requires_an_explicit_demo_signal(
    cluster_role: str,
    environment: str,
    install_sample_workload: bool,
    expected: str,
) -> None:
    assert (
        evidence_profile_for_registration(
            cluster_role=cluster_role,
            environment=environment,
            install_sample_workload=install_sample_workload,
        )
        == expected
    )


def test_shared_backend_query_fails_closed_without_a_cluster_matcher() -> None:
    with pytest.raises(ValueError, match="shared backend queries require a matcher"):
        EvidenceQueryProvenance(
            cluster_id="cluster-a",
            evidence_profile=STANDARD_EVIDENCE_PROFILE,
            backend_scope="shared",
            query_scope="cluster",
        )

    provenance = EvidenceQueryProvenance(
        cluster_id="cluster-a",
        evidence_profile=STANDARD_EVIDENCE_PROFILE,
        backend_scope="shared",
        query_scope="cluster",
        required_matchers=('cluster_id="cluster-a"',),
    )
    with pytest.raises(ValueError, match="required scope matcher"):
        EvidencePolicyQuery(
            source="prometheus",
            name="cluster_errors",
            description="cluster scoped errors",
            query="up",
            provenance=provenance,
        )
