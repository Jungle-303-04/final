from services.ai.agent.causes.loader import load_catalog_profiles


def test_matchmaking_catalog_accepts_standardized_admission_failure() -> None:
    profile = next(
        item for item in load_catalog_profiles() if item.rule_id == "matchmaking_join_failure"
    )

    assert "admission_failure" in profile.symptoms
    lobby = next(
        item for item in profile.candidate_specs if item.candidate_id == "lobby_capacity_saturation"
    )
    facts = {
        matcher["fact"]
        for group in lobby.signals
        for matcher in group["any_of"]
        if "fact" in matcher
    }
    assert "alert_name=OpsiaSliFailureRatioHigh" in facts
