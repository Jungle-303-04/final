import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getCatalogItem, listCatalogItems } from "./catalog";

const ITEM = {
  item_id: "catalog-postgresql",
  display_name: "PostgreSQL",
  category: "database",
  package_type: "helm",
  default_version: "1.0.0",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Catalog API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the catalog item list", async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({
        items: [{
          ...ITEM,
          provider_extension: { nested: ["preserved"] },
        }],
      }));

    await expect(listCatalogItems(controller.signal)).resolves.toEqual({
      items: [{
        ...ITEM,
        provider_extension: { nested: ["preserved"] },
      }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog/items",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      }),
    );
  });

  it("loads an encoded catalog item detail", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ item: ITEM }));
    const controller = new AbortController();

    await expect(getCatalogItem("catalog/postgresql", controller.signal)).resolves.toEqual({
      item: ITEM,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog/items/catalog%2Fpostgresql",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects an empty item id before making a request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(() => getCatalogItem(" ")).toThrow("itemId must not be empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves not-found errors and rejects malformed responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "catalog item not found" }, 404),
    );
    await expect(getCatalogItem("missing-item")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "catalog item not found",
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ items: "invalid" }));
    await expect(listCatalogItems()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("rejects unknown envelope fields while keeping item JsonMap open", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      item: {
        ...ITEM,
        future_configuration: { fields: ["alpha", "beta"] },
      },
    }));

    await expect(getCatalogItem("catalog-postgresql")).resolves.toMatchObject({
      item: { future_configuration: { fields: ["alpha", "beta"] } },
    });

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      item: ITEM,
      trace_id: "invented-envelope-field",
    }));

    await expect(getCatalogItem("catalog-postgresql")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      items: [],
      cursor: "invented-pagination-is-not-allowed",
    }));

    await expect(listCatalogItems()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });
});
