from __future__ import annotations

from fastapi import FastAPI

from domains.applications.router import router as applications_router
from domains.catalog.router import router as catalog_router
from domains.command.router import router as command_router
from domains.inventory.router import router as inventory_router
from domains.target.router import router as target_router
from packages.contracts.gateway import routes


def platform_foundation_app() -> FastAPI:
    app = FastAPI()
    app.include_router(target_router)
    app.include_router(inventory_router)
    app.include_router(command_router)
    app.include_router(applications_router)
    app.include_router(catalog_router)
    return app


def test_platform_foundation_routes_are_present_in_openapi() -> None:
    paths = platform_foundation_app().openapi()["paths"]

    expected = {
        routes.CLUSTERS_PATH,
        routes.CLUSTER_CONNECTION_STATUS_PATH,
        routes.AGENT_INVENTORY_SNAPSHOTS_PATH,
        routes.CLUSTER_INVENTORY_RESOURCES_PATH,
        routes.CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH,
        routes.RESOURCE_CAPABILITIES_PATH,
        routes.CLUSTER_INVENTORY_SUMMARY_PATH,
        routes.CLUSTER_DEPLOYMENT_SCALE_PATH,
        routes.CLUSTER_DEPLOYMENT_RESTART_PATH,
        routes.CLUSTER_SCHEDULING_PROFILES_PATH,
        routes.APPLICATIONS_PATH,
        routes.APPLICATION_CONNECT_PATH,
        routes.APPLICATION_DEPLOYMENTS_PATH,
        routes.APPLICATION_RUNS_PATH,
        routes.CATALOG_ITEMS_PATH,
        routes.CATALOG_ITEM_INSTALLS_PATH,
    }

    assert expected <= set(paths)
