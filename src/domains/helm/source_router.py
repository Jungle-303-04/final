"""Workspace RBAC and external-provider boundary for Helm chart sources."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from domains.helm.events import HelmChartSourceDeletedBody
from domains.helm.repository import (
    HelmChartSourceConflict,
    HelmChartSourceIdentityConflict,
    HelmChartSourceNotFound,
)
from domains.helm.source_provider import (
    HelmChartVersionProvider,
    HelmProviderCredential,
    helm_chart_credential_provider,
    helm_chart_credential_scope,
    helm_chart_source_from_row,
    helm_chart_source_id,
    normalize_helm_chart_source_reference,
)
from domains.identity.dependencies import (
    require_admin_session,
    require_resource_access,
    require_session,
)
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import AcceptedResponse
from packages.contracts.helm.sources import (
    HELM_CHART_SOURCE_PAGE_MAX,
    HelmChartSource,
    HelmChartSourceCredentialInput,
    HelmChartSourceDeleteRequest,
    HelmChartSourcePage,
    HelmChartSourceRegisterRequest,
    HelmChartVersionObservation,
)
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    Permission,
    ServiceRole,
)
from packages.events.context import event_workspace
from packages.runtime.dependencies import get_db, get_events
from packages.security.credentials import (
    CredentialEncryptionError,
    credential_ref,
    decrypt_credential,
    encrypt_credential,
    parse_credential_ref,
)
from packages.storage.engine import unit_of_work_or_null


class RedactedValidationRoute(APIRoute):
    """Keep validation structure while removing all rejected request values."""

    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def redacted_handler(request: Request) -> Response:
            try:
                return await original_handler(request)
            except RequestValidationError as exc:
                errors = [
                    {key: value for key, value in error.items() if key in {"type", "loc", "msg"}}
                    for error in exc.errors()
                ]
                return JSONResponse(status_code=422, content={"detail": errors})

        return redacted_handler


router = APIRouter(route_class=RedactedValidationRoute)

HELM_CHART_SOURCE_RESOURCE_TYPE = AccessResourceType.HELM_CHART_SOURCE.value
HELM_CHART_SOURCE_NOT_FOUND = "Helm chart source not found"
HELM_CHART_SOURCE_CONFLICT = "Helm chart source already exists"
HELM_CHART_CREDENTIAL_UNAVAILABLE = "helm_chart_source_credential_unavailable"


def get_helm_chart_version_provider() -> HelmChartVersionProvider:
    return HelmChartVersionProvider()


@router.get(
    gateway_routes.HELM_CHART_SOURCES_PATH,
    response_model=HelmChartSourcePage,
)
async def list_helm_chart_sources(
    limit: int = Query(default=50, ge=1, le=HELM_CHART_SOURCE_PAGE_MAX),
    cursor: str | None = Query(default=None, min_length=1, max_length=4096),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> HelmChartSourcePage:
    workspace_id = _workspace_id(current)
    source_ids = await _accessible_source_ids(
        db,
        current,
        workspace_id,
        Permission.CATALOG_READ.value,
    )
    delete_ids: set[str] | None = set()
    if ServiceRole.SERVICE_ADMIN.value in tuple(getattr(current, "roles", ()) or ()):
        delete_ids = await _accessible_source_ids(
            db,
            current,
            workspace_id,
            Permission.CONFIG_UPDATE.value,
        )
    page = await asyncio.to_thread(
        db.list_helm_chart_sources,
        workspace_id=workspace_id,
        limit=limit,
        cursor=cursor,
        source_ids=source_ids,
    )
    return page.model_copy(
        update={
            "items": tuple(
                source.model_copy(
                    update={
                        "actions": ("delete",)
                        if delete_ids is None or source.source_id in delete_ids
                        else ()
                    }
                )
                for source in page.items
            )
        }
    )


@router.post(
    gateway_routes.HELM_CHART_SOURCES_PATH,
    response_model=HelmChartSource,
    status_code=201,
)
async def register_helm_chart_source(
    payload: HelmChartSourceRegisterRequest,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> HelmChartSource:
    workspace_id = _workspace_id(current)
    try:
        return await asyncio.to_thread(
            _register_chart_source,
            db,
            workspace_id,
            payload,
        )
    except HelmChartSourceConflict as exc:
        raise HTTPException(status_code=409, detail=HELM_CHART_SOURCE_CONFLICT) from exc
    except CredentialEncryptionError as exc:
        raise HTTPException(status_code=503, detail=HELM_CHART_CREDENTIAL_UNAVAILABLE) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete(
    gateway_routes.HELM_CHART_SOURCE_PATH,
    response_model=AcceptedResponse,
)
async def delete_helm_chart_source(
    payload: HelmChartSourceDeleteRequest,
    source_id: str = Path(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$"),
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    """Atomically delete one exact source, its credential, and durable audit event."""

    workspace_id = _workspace_id(current)
    await asyncio.to_thread(
        require_resource_access,
        db,
        current,
        workspace_id,
        HELM_CHART_SOURCE_RESOURCE_TYPE,
        source_id,
        Permission.CONFIG_UPDATE.value,
    )
    try:
        canonical_reference = normalize_helm_chart_source_reference(
            payload.provider,
            payload.reference,
        )

        def stage(_conn: Any, _event: Any) -> None:
            _delete_chart_source(
                db,
                workspace_id=workspace_id,
                source_id=source_id,
                expected_provider=payload.provider,
                expected_name=payload.name,
                expected_reference=canonical_reference,
            )

        with event_workspace(workspace_id):
            accepted = await events.accept_body(
                HelmChartSourceDeletedBody(
                    workspace_id=workspace_id,
                    source_id=source_id,
                    provider=payload.provider,
                    name=payload.name,
                    reference=canonical_reference,
                ),
                actor=Actor(str(current.user_id), tuple(current.roles)),
                transactional_stage=stage,
            )
    except HelmChartSourceNotFound as exc:
        raise HTTPException(status_code=404, detail=HELM_CHART_SOURCE_NOT_FOUND) from exc
    except HelmChartSourceIdentityConflict as exc:
        raise HTTPException(status_code=409, detail="Helm chart source identity changed") from exc
    except CredentialEncryptionError as exc:
        raise HTTPException(status_code=503, detail=HELM_CHART_CREDENTIAL_UNAVAILABLE) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return AcceptedResponse(
        accepted=True,
        event_id=str(accepted.event.event_id),
        correlation_id=str(accepted.event.correlation_id),
    )


@router.get(
    gateway_routes.HELM_CHART_SOURCE_VERSIONS_PATH,
    response_model=HelmChartVersionObservation,
)
async def get_helm_chart_source_versions(
    source_id: str = Path(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$"),
    chart_name: str = Path(
        min_length=1,
        max_length=512,
        pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$",
    ),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    provider: HelmChartVersionProvider = Depends(get_helm_chart_version_provider),
) -> HelmChartVersionObservation:
    workspace_id = _workspace_id(current)
    await asyncio.to_thread(
        require_resource_access,
        db,
        current,
        workspace_id,
        HELM_CHART_SOURCE_RESOURCE_TYPE,
        source_id,
        Permission.CATALOG_READ.value,
    )
    row = await asyncio.to_thread(
        db.get_helm_chart_source_record,
        workspace_id=workspace_id,
        source_id=source_id,
    )
    if row is None or str(row.get("status") or "") != "active":
        raise HTTPException(status_code=404, detail=HELM_CHART_SOURCE_NOT_FOUND)
    source = helm_chart_source_from_row(row)
    try:
        credential = await asyncio.to_thread(
            _load_provider_credential,
            db,
            workspace_id,
            row,
        )
    except CredentialEncryptionError:
        return HelmChartVersionObservation(
            source=source,
            chart_name=chart_name,
            availability="unavailable",
            versions=(),
            reason_codes=(HELM_CHART_CREDENTIAL_UNAVAILABLE,),
        )
    return await provider.fetch_versions(
        source,
        chart_name,
        credential=credential,
    )


def _workspace_id(current: Any) -> str:
    return str(getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID) or DEFAULT_WORKSPACE_ID)


async def _accessible_source_ids(
    db: Any,
    current: Any,
    workspace_id: str,
    permission: str,
) -> set[str] | None:
    accessible = getattr(db, "accessible_resource_ids", None)
    if not callable(accessible):
        return set()
    result = await asyncio.to_thread(
        accessible,
        str(getattr(current, "user_id", "")),
        workspace_id,
        HELM_CHART_SOURCE_RESOURCE_TYPE,
        permission,
    )
    return None if result is None else {str(value) for value in result}


def _delete_chart_source(
    db: Any,
    *,
    workspace_id: str,
    source_id: str,
    expected_provider: str,
    expected_name: str,
    expected_reference: str,
) -> None:
    deleted = db.delete_helm_chart_source(
        workspace_id=workspace_id,
        source_id=source_id,
        expected_provider=expected_provider,
        expected_name=expected_name,
        expected_reference=expected_reference,
    )
    ref = str(deleted.get("credential_ref") or "")
    if not ref:
        return
    provider, scope = parse_credential_ref(ref)
    expected_credential_provider = helm_chart_credential_provider(expected_provider)
    expected_scope = helm_chart_credential_scope(source_id)
    if provider != expected_credential_provider or scope != expected_scope:
        raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)
    delete_credential = getattr(db, "delete_workspace_credential", None)
    if not callable(delete_credential) or not delete_credential(workspace_id, provider, scope):
        raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)


def _credential_payload(
    credential: HelmChartSourceCredentialInput,
) -> dict[str, str]:
    if credential.kind == "bearer" and credential.token is not None:
        return {
            "kind": "bearer",
            "token": credential.token.get_secret_value(),
        }
    if (
        credential.kind == "basic"
        and credential.username is not None
        and credential.password is not None
    ):
        return {
            "kind": "basic",
            "username": credential.username,
            "password": credential.password.get_secret_value(),
        }
    raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)


def _register_chart_source(
    db: Any,
    workspace_id: str,
    payload: HelmChartSourceRegisterRequest,
) -> HelmChartSource:
    canonical_ref = normalize_helm_chart_source_reference(
        payload.provider,
        payload.reference,
    )
    source_id = helm_chart_source_id(workspace_id, payload.provider, canonical_ref)
    stored_credential_ref = None
    with unit_of_work_or_null(db):
        if payload.credential is not None:
            provider = helm_chart_credential_provider(payload.provider)
            scope = helm_chart_credential_scope(source_id)
            stored_credential_ref = credential_ref(provider, scope)
            encrypted = encrypt_credential(
                json.dumps(
                    _credential_payload(payload.credential),
                    ensure_ascii=True,
                    separators=(",", ":"),
                    sort_keys=True,
                )
            )
            locker = getattr(db, "lock_workspace_credential_scope", None)
            if callable(locker):
                locker(workspace_id, provider, scope)
            stored = db.upsert_workspace_credential(
                {
                    "workspace_id": workspace_id,
                    "provider": provider,
                    "scope": scope,
                    "encrypted_value": encrypted,
                    "metadata": {
                        "source_id": source_id,
                        "credential_kind": payload.credential.kind,
                    },
                }
            )
            _require_exact_credential_binding(
                stored,
                workspace_id=workspace_id,
                provider=provider,
                scope=scope,
            )
        return db.register_helm_chart_source(
            workspace_id=workspace_id,
            provider=payload.provider,
            name=payload.name,
            reference=canonical_ref,
            credential_ref=stored_credential_ref,
            access_policy={},
        )


def _load_provider_credential(
    db: Any,
    workspace_id: str,
    row: dict[str, Any],
) -> HelmProviderCredential | None:
    ref = str(row.get("credential_ref") or "")
    if not ref:
        return None
    provider, scope = parse_credential_ref(ref)
    expected_provider = helm_chart_credential_provider(str(row.get("provider") or ""))
    expected_scope = helm_chart_credential_scope(str(row.get("source_id") or ""))
    if provider != expected_provider or scope != expected_scope:
        raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)
    getter = getattr(db, "get_workspace_credential", None)
    stored = getter(workspace_id, provider, scope) if callable(getter) else None
    if (
        not isinstance(stored, dict)
        or str(stored.get("workspace_id") or "") != workspace_id
        or str(stored.get("provider") or "") != provider
        or str(stored.get("scope") or "") != scope
        or str(stored.get("status") or "active") != "active"
    ):
        raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)
    try:
        payload = json.loads(decrypt_credential(str(stored.get("encrypted_value") or "")))
    except (CredentialEncryptionError, json.JSONDecodeError) as exc:
        raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE) from exc
    if not isinstance(payload, dict):
        raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)
    kind = str(payload.get("kind") or "")
    if kind == "bearer":
        token = str(payload.get("token") or "")
        if token:
            return HelmProviderCredential(kind=kind, token=token)
    if kind == "basic":
        username = str(payload.get("username") or "")
        password = str(payload.get("password") or "")
        if username and password:
            return HelmProviderCredential(
                kind=kind,
                username=username,
                password=password,
            )
    raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)


def _require_exact_credential_binding(
    stored: object,
    *,
    workspace_id: str,
    provider: str,
    scope: str,
) -> None:
    if (
        not isinstance(stored, dict)
        or str(stored.get("workspace_id") or "") != workspace_id
        or str(stored.get("provider") or "") != provider
        or str(stored.get("scope") or "") != scope
        or str(stored.get("status") or "active") != "active"
    ):
        raise CredentialEncryptionError(HELM_CHART_CREDENTIAL_UNAVAILABLE)
