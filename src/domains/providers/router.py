from __future__ import annotations

from fastapi import APIRouter

from domains.providers.catalog import catalog_body, validate_provider_selection
from packages.contracts.gateway.requests import ProviderSelectionRequest
from packages.contracts.gateway.responses import ProviderCatalogResponse, ProviderValidationResponse
from packages.contracts.gateway.routes import PROVIDERS_CATALOG_PATH, PROVIDERS_VALIDATE_PATH

router = APIRouter()


@router.get(PROVIDERS_CATALOG_PATH, response_model=ProviderCatalogResponse)
async def provider_catalog() -> ProviderCatalogResponse:
    return ProviderCatalogResponse(providers=catalog_body())


@router.post(PROVIDERS_VALIDATE_PATH, response_model=ProviderValidationResponse)
async def provider_selection_validate(
    payload: ProviderSelectionRequest,
) -> ProviderValidationResponse:
    result = validate_provider_selection(
        {
            "source": payload.source_provider,
            "deploy": payload.deploy_provider,
            "cloud": payload.cloud_provider,
            "secret": payload.secret_provider,
        },
        credential_refs=payload.credential_refs,
        capabilities=tuple(payload.capabilities),
    )
    return ProviderValidationResponse(**result)
