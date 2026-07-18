from pathlib import Path

import yaml


def test_management_command_janitor_owns_demo_retention_policy() -> None:
    root = Path(__file__).resolve().parents[1]
    documents = [
        document
        for document in yaml.safe_load_all(
            (root / "deploy/management/services.yaml").read_text(encoding="utf-8")
        )
        if isinstance(document, dict) and document.get("kind") == "Deployment"
    ]
    command_janitor = next(
        document
        for document in documents
        if document.get("metadata", {}).get("name") == "command-janitor"
    )
    container = command_janitor["spec"]["template"]["spec"]["containers"][0]
    environment = {item["name"]: item["value"] for item in container["env"]}

    assert environment == {
        "APP_ENV": "demo",
        "DEMO_DATA_RETENTION_ENABLED": "true",
        "DEMO_DATA_RETENTION_HOURS": "24",
        "DEMO_DATA_RETENTION_DELETE_LIMIT": "500",
        "DEMO_DATA_RETENTION_SCOPES": (
            "observations,events,incidents,rca,evidence,timeline,commands,projections"
        ),
        "DB_RETENTION_SWEEP_INTERVAL_SECONDS": "300",
    }
    for deployment in documents:
        if deployment is command_janitor:
            continue
        for workload_container in deployment["spec"]["template"]["spec"]["containers"]:
            names = {item["name"] for item in workload_container.get("env", [])}
            assert "DEMO_DATA_RETENTION_ENABLED" not in names
