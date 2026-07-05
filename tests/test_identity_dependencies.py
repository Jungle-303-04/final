from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.identity.dependencies import ResourceAccessFilterChain, require_resource_access
from packages.contracts.identity import AccessResourceType, Permission, ResourceAccessRequest


def test_require_resource_access_prefers_structured_access_request() -> None:
    class StructuredDb:
        request: ResourceAccessRequest | None = None

        def can_access_request(self, request: ResourceAccessRequest) -> bool:
            self.request = request
            return True

        def can_access(self, *_args: object) -> bool:
            raise AssertionError("can_access should not run before can_access_request")

        def user_has_resource_access(self, *_args: object) -> bool:
            raise AssertionError("legacy access API should not run before structured API")

    db = StructuredDb()
    current = SimpleNamespace(user_id="user-1")

    require_resource_access(
        db,
        current,
        "org-a",
        AccessResourceType.CLUSTER.value,
        "cluster-1",
        Permission.DEPLOY_RUN.value,
    )

    assert db.request == ResourceAccessRequest(
        user_id="user-1",
        organization_id="org-a",
        resource_type=AccessResourceType.CLUSTER.value,
        resource_id="cluster-1",
        permission=Permission.DEPLOY_RUN.value,
    )


def test_require_resource_access_fails_closed_without_access_backend() -> None:
    current = SimpleNamespace(user_id="user-1")

    with pytest.raises(HTTPException) as exc:
        require_resource_access(
            object(),
            current,
            "org-a",
            AccessResourceType.CLUSTER.value,
            "cluster-1",
            Permission.DEPLOY_RUN.value,
        )

    assert exc.value.status_code == 403


def test_require_resource_access_fails_closed_with_empty_filter_chain() -> None:
    current = SimpleNamespace(user_id="user-1")

    with pytest.raises(HTTPException) as exc:
        require_resource_access(
            object(),
            current,
            "org-a",
            AccessResourceType.CLUSTER.value,
            "cluster-1",
            Permission.DEPLOY_RUN.value,
            filter_chain=ResourceAccessFilterChain(filters=()),
        )

    assert exc.value.status_code == 403
