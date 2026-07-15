"""Strict JSON/OpenAPI contracts shared by Timeline browser and desktop consumers."""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from domains.timeline.router import router
from domains.timeline.settings import (
    timeline_capability_descriptor,
    timeline_coverage_source_availability,
)
from packages.contracts.timeline import (
    TimelineCapabilityDescriptor,
    TimelineOverview,
    TimelineOverviewActivityFacet,
    TimelineOverviewBucket,
    TimelineOverviewFacets,
    TimelineStreamFrame,
    TimelineWindow,
)


def test_timeline_capability_and_overview_examples_are_strict_json_contracts() -> None:
    descriptor = timeline_capability_descriptor()
    descriptor_payload = json.loads(descriptor.model_dump_json())
    restored_descriptor = TimelineCapabilityDescriptor.model_validate_json(
        json.dumps(descriptor_payload)
    )
    assert restored_descriptor == descriptor
    assert set(descriptor_payload["control_surface"]) == {
        "views",
        "groupings",
        "sorts",
        "activity",
        "deleted",
        "kinds",
        "time_ranges",
        "default_time_range_id",
        "custom_time_range_id",
        "lens_zoom_rungs",
        "default_lens_zoom_rung",
        "legend",
        "pins",
    }
    assert descriptor_payload["control_surface"]["pins"] == {
        "key": "pins",
        "label": "Pinned lanes",
        "availability": "available",
        "storage": "server",
        "revision": "pin_set",
        "subject_kinds": ["resource", "application"],
    }

    overview = TimelineOverview(
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        bucket_width_ms=3_600_000,
        buckets=(
            TimelineOverviewBucket(
                from_ms=1_000,
                to_ms=2_000,
                event_count=3,
                problem_count=1,
            ),
        ),
        coverage_sources=timeline_coverage_source_availability(),
        facets=TimelineOverviewFacets(
            activity=(
                TimelineOverviewActivityFacet(activity="change", count=3),
                TimelineOverviewActivityFacet(activity="k8s_event", count=0),
                TimelineOverviewActivityFacet(activity="unhealthy", count=0),
                TimelineOverviewActivityFacet(activity="warning", count=1),
            ),
            kinds=(),
        ),
        new_evidence_count=None,
    )
    overview_payload = json.loads(overview.model_dump_json())
    assert overview_payload == {
        "window": {"from_ms": 1_000, "to_ms": 2_000},
        "bucket_width_ms": 3_600_000,
        "buckets": [{"from_ms": 1_000, "to_ms": 2_000, "event_count": 3, "problem_count": 1}],
        "coverage": [],
        "coverage_sources": [
            {"source": "inventory", "availability": "unavailable"},
            {"source": "incident", "availability": "unavailable"},
            {"source": "application_workflow", "availability": "unavailable"},
            {"source": "kubernetes_event", "availability": "observed"},
            {"source": "gitops", "availability": "unavailable"},
        ],
        "facets": {
            "activity": [
                {"activity": "change", "count": 3},
                {"activity": "k8s_event", "count": 0},
                {"activity": "unhealthy", "count": 0},
                {"activity": "warning", "count": 1},
            ],
            "kinds": [],
        },
        "new_evidence_count": None,
        "pin_set_revision": None,
    }
    with pytest.raises(ValidationError):
        TimelineCapabilityDescriptor.model_validate({**descriptor_payload, "ui_fallback": "local"})
    with pytest.raises(ValidationError):
        TimelineOverview.model_validate({**overview_payload, "events": []})


def test_timeline_openapi_exposes_shared_capabilities_and_overview_models() -> None:
    app = FastAPI()
    app.include_router(router)
    document = app.openapi()

    overview_operation = document["paths"]["/timeline/overview"]["post"]
    assert overview_operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/TimelineOverviewRequest"
    }
    assert overview_operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/TimelineOverview"
    }
    pin_get = document["paths"]["/timeline/pins"]["get"]
    pin_put = document["paths"]["/timeline/pins"]["put"]
    pin_delete = document["paths"]["/timeline/pins/{pin_id}"]["delete"]
    assert pin_get["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/TimelinePinSet"
    }
    assert pin_put["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/TimelinePinUpsertRequest"
    }
    assert pin_put["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/TimelinePinMutation"
    }
    assert pin_delete["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/TimelinePinMutation"
    }
    assert any(parameter["name"] == "expected_revision" for parameter in pin_delete["parameters"])
    capability_schema = document["components"]["schemas"]["TimelineCapabilityDescriptor"]
    overview_schema = document["components"]["schemas"]["TimelineOverview"]
    assert capability_schema["additionalProperties"] is False
    assert "control_surface" in capability_schema["properties"]
    assert overview_schema["additionalProperties"] is False
    assert set(overview_schema["properties"]) == {
        "window",
        "bucket_width_ms",
        "buckets",
        "coverage",
        "coverage_sources",
        "facets",
        "new_evidence_count",
        "pin_set_revision",
    }
    frame_schema = TimelineStreamFrame.model_json_schema()
    assert frame_schema["properties"]["pin_set_revision"]["anyOf"] == [
        {"type": "integer", "minimum": 0},
        {"type": "null"},
    ]
