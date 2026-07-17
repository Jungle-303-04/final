from datetime import UTC, datetime

from domains.helm.release_projection import helm_release_detail, helm_release_list


def _row(
    *,
    cluster_id: str = "cluster-a",
    namespace: str = "storefront",
    release: str = "storefront",
    revision: str = "3",
    status: str = "deployed",
    observed_at: datetime | None = None,
) -> dict[str, object]:
    return {
        "workspace_id": "workspace-a",
        "cluster_id": cluster_id,
        "inventory_key": f"inventory-{cluster_id}-{namespace}-{release}-{revision}",
        "api_version": "v1",
        "kind": "Secret",
        "namespace": namespace,
        "name": f"sh.helm.release.v1.{release}.v{revision}",
        "uid": f"uid-{revision}",
        "labels": {
            "owner": "helm",
            "name": release,
            "version": revision,
            "status": status,
        },
        "observed_at": observed_at or datetime(2026, 7, 16, 9, 0, tzinfo=UTC),
        "raw": {"data": {"release": "must-not-leak"}},
    }


def _contexts(*cluster_ids: str) -> dict[str, dict[str, object]]:
    return {
        cluster_id: {
            "snapshot_revision": 4,
            "observed_at": "2026-07-16T09:00:00+00:00",
            "labels_complete": True,
            "resources_complete": True,
            "partial_reason_codes": [],
        }
        for cluster_id in cluster_ids
    }


def _owned_row(
    *,
    release: str = "storefront",
    namespace: str = "storefront",
    kind: str = "Deployment",
    name: str = "storefront",
    health: str = "healthy",
    chart_label: str | None = None,
) -> dict[str, object]:
    return {
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "inventory_key": f"{kind.casefold()}-{namespace}-{name}",
        "api_version": "apps/v1" if kind == "Deployment" else "v1",
        "kind": kind,
        "namespace": namespace,
        "name": name,
        "uid": f"uid-{kind.casefold()}-{name}",
        "status": "Available",
        "health": health,
        "observed_at": datetime(2026, 7, 16, 9, 1, tzinfo=UTC),
        "release_name": release,
        "release_namespace": namespace,
        "chart_label": chart_label,
    }


def _online_agents(*cluster_ids: str) -> dict[str, dict[str, str]]:
    return {
        cluster_id: {"last_seen_at": datetime.now(UTC).isoformat()} for cluster_id in cluster_ids
    }


def test_release_list_uses_only_standard_helm_storage_metadata_and_latest_revision() -> None:
    older = _row(revision="2", observed_at=datetime(2026, 7, 16, 8, 0, tzinfo=UTC))
    latest = _row(revision="3")
    ignored = _row(release="ignored")
    ignored["labels"] = {"owner": "not-helm", "name": "ignored"}

    body = helm_release_list(
        [older, latest, ignored],
        contexts=_contexts("cluster-a"),
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_ids=("cluster-a",),
        owned_resource_rows=[_owned_row(chart_label="storefront-1.2.3")],
    ).model_dump(mode="json")

    assert body["coverage"] == {
        "availability": "available",
        "observed_at": "2026-07-16T09:00:00+00:00",
        "reason_codes": [],
    }
    assert body["refresh_after_seconds"] == 30
    assert body["post_mutation_refresh_after_seconds"] == 1.2
    assert body["releases"] == [
        {
            "scope": {
                "workspace_id": "workspace-a",
                "cluster_id": "cluster-a",
                "namespaces": ["storefront"],
                "freshness": "live",
            },
            "name": "storefront",
            "storage_namespace": "storefront",
            "storage": {
                "api_group": "",
                "version": "v1",
                "kind": "Secret",
                "namespace": "storefront",
                "name": "sh.helm.release.v1.storefront.v3",
                "uid": "uid-3",
            },
            "chart": "storefront",
            "chart_version": "1.2.3",
            "chart_reason_codes": [],
            "app_version": None,
            "status": "deployed",
            "revision": 3,
            "observed_at": "2026-07-16T09:00:00+00:00",
            "resource_health": {
                "availability": "available",
                "health": "healthy",
                "resource_count": 1,
                "observed_at": "2026-07-16T09:01:00+00:00",
                "reason_codes": [],
            },
        }
    ]
    assert "must-not-leak" not in str(body)


def test_release_chart_identity_fails_closed_for_conflicting_owned_resource_labels() -> None:
    body = helm_release_list(
        [_row()],
        contexts=_contexts("cluster-a"),
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_ids=("cluster-a",),
        owned_resource_rows=[
            _owned_row(chart_label="storefront-1.2.3"),
            _owned_row(kind="Service", chart_label="another-chart-9.0.0"),
        ],
    ).model_dump(mode="json")

    assert body["releases"][0]["chart"] is None
    assert body["releases"][0]["chart_version"] is None
    assert body["releases"][0]["chart_reason_codes"] == ["helm_chart_identity_ambiguous"]


def test_release_chart_identity_never_guesses_when_the_label_has_multiple_semver_splits() -> None:
    body = helm_release_list(
        [_row()],
        contexts=_contexts("cluster-a"),
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_ids=("cluster-a",),
        owned_resource_rows=[
            _owned_row(chart_label="storefront-1.2.3-plugin-2.0.0"),
        ],
    ).model_dump(mode="json")

    assert body["releases"][0]["chart"] is None
    assert body["releases"][0]["chart_version"] is None
    assert body["releases"][0]["chart_reason_codes"] == ["helm_chart_identity_invalid"]


def test_incomplete_label_collection_is_partial_so_empty_result_is_not_misleading() -> None:
    contexts = _contexts("cluster-a")
    contexts["cluster-a"]["labels_complete"] = False
    contexts["cluster-a"]["partial_reason_codes"] = ["source_labels_truncated"]

    coverage = helm_release_list(
        [],
        contexts=contexts,
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_ids=("cluster-a",),
    ).coverage.model_dump(mode="json")

    assert coverage == {
        "availability": "partial",
        "observed_at": "2026-07-16T09:00:00+00:00",
        "reason_codes": ["helm_storage_labels_incomplete", "source_labels_truncated"],
    }


def test_detail_exposes_observed_history_and_explicitly_unavailable_integrations() -> None:
    response = helm_release_detail(
        [_row(revision="2"), _row(revision="3")],
        contexts=_contexts("cluster-a"),
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_id="cluster-a",
        namespace="storefront",
        release_name="storefront",
        owned_resource_rows=[
            _owned_row(),
            _owned_row(kind="Service", name="storefront-http", health="unknown"),
        ],
    )

    assert response is not None
    assert response.refresh_after_seconds == 10
    assert response.post_mutation_refresh_after_seconds == 1.2
    detail = response.model_dump(mode="json")["detail"]
    assert [entry["revision"] for entry in detail["history"]] == [3, 2]
    assert detail["manifest"] == {
        "availability": "unavailable",
        "reason_code": "helm_manifest_provider_not_integrated",
    }
    assert detail["values"]["reason_code"] == "helm_values_provider_not_integrated"
    assert detail["owned_resources"] == {
        "availability": "available",
        "items": [
            {
                "resource": {
                    "api_group": "apps",
                    "version": "v1",
                    "kind": "Deployment",
                    "namespace": "storefront",
                    "name": "storefront",
                    "uid": "uid-deployment-storefront",
                },
                "status": "Available",
                "health": "healthy",
                "observed_at": "2026-07-16T09:01:00+00:00",
            },
            {
                "resource": {
                    "api_group": "",
                    "version": "v1",
                    "kind": "Service",
                    "namespace": "storefront",
                    "name": "storefront-http",
                    "uid": "uid-service-storefront-http",
                },
                "status": "Available",
                "health": "unknown",
                "observed_at": "2026-07-16T09:01:00+00:00",
            },
        ],
        "observed_at": "2026-07-16T09:01:00+00:00",
        "truncated": False,
        "reason_codes": [],
    }
    assert detail["release"]["resource_health"]["health"] == "mixed"
    assert detail["commands"]["reason_code"] == "agent_helm_executor_not_integrated"


def test_owned_resource_correlation_is_exact_and_reports_partial_truncation() -> None:
    contexts = _contexts("cluster-a")
    contexts["cluster-a"]["resources_complete"] = False
    contexts["cluster-a"]["partial_reason_codes"] = ["source_namespaces_truncated"]
    wrong_namespace = _owned_row()
    wrong_namespace["release_namespace"] = "another"

    response = helm_release_detail(
        [_row()],
        contexts=contexts,
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_id="cluster-a",
        namespace="storefront",
        release_name="storefront",
        owned_resource_rows=[_owned_row(health="degraded"), wrong_namespace],
        owned_resources_truncated=True,
    )

    assert response is not None
    detail = response.model_dump(mode="json")["detail"]
    assert detail["release"]["resource_health"] == {
        "availability": "partial",
        "health": "degraded",
        "resource_count": 1,
        "observed_at": "2026-07-16T09:01:00+00:00",
        "reason_codes": [
            "helm_owned_resources_truncated",
            "source_namespaces_truncated",
            "source_resources_incomplete",
        ],
    }
    assert detail["owned_resources"]["truncated"] is True
    assert len(detail["owned_resources"]["items"]) == 1


def test_detail_returns_none_for_another_cluster_or_namespace() -> None:
    assert (
        helm_release_detail(
            [_row()],
            contexts=_contexts("cluster-a"),
            agent_statuses=_online_agents("cluster-a"),
            selected_cluster_id="cluster-b",
            namespace="storefront",
            release_name="storefront",
        )
        is None
    )


def test_release_scope_freshness_combines_heartbeat_and_inventory_evidence() -> None:
    complete = _contexts("cluster-a")
    partial = _contexts("cluster-a")
    partial["cluster-a"]["labels_complete"] = False

    live = helm_release_list(
        [_row()],
        contexts=complete,
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_ids=("cluster-a",),
    )
    incomplete = helm_release_list(
        [_row()],
        contexts=partial,
        agent_statuses=_online_agents("cluster-a"),
        selected_cluster_ids=("cluster-a",),
    )
    stale = helm_release_list(
        [_row()],
        contexts=complete,
        agent_statuses={"cluster-a": {"last_seen_at": "2000-01-01T00:00:00+00:00"}},
        selected_cluster_ids=("cluster-a",),
    )
    disconnected = helm_release_list(
        [_row()],
        contexts=complete,
        agent_statuses={},
        selected_cluster_ids=("cluster-a",),
    )

    assert live.releases[0].scope.freshness == "live"
    assert incomplete.releases[0].scope.freshness == "partial"
    assert stale.releases[0].scope.freshness == "stale"
    assert disconnected.releases[0].scope.freshness == "disconnected"
    assert stale.releases[0].observed_at == "2026-07-16T09:00:00+00:00"
    assert incomplete.coverage.model_dump(mode="json") == {
        "availability": "partial",
        "observed_at": "2026-07-16T09:00:00+00:00",
        "reason_codes": ["helm_storage_labels_incomplete"],
    }
