from domains.inventory.snapshot_evidence import snapshot_source_summary


def test_reads_persisted_agent_summary_envelope() -> None:
    source = {"detected_provider": "eks", "resources_complete": True}

    assert (
        snapshot_source_summary({"summary": {"summary": source, "health": {}, "usage": {}}})
        == source
    )


def test_preserves_legacy_direct_summary_compatibility() -> None:
    source = {"detected_provider": "gke"}

    assert snapshot_source_summary({"summary": source}) == source


def test_rejects_missing_or_invalid_snapshot_envelopes() -> None:
    assert snapshot_source_summary(None) is None
    assert snapshot_source_summary({}) is None
    assert snapshot_source_summary({"summary": "invalid"}) is None
