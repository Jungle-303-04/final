import { beforeEach, describe, expect, it, vi } from "vitest";
import { listGlobalFilterFacets } from "./global-filter";

const payload = {
  clusters: [{ id: "cluster-a", label: "Production", count: 9, count_completeness: "exact" }],
  namespaces: [{ id: "cluster-a/shop", label: "shop", cluster_id: "cluster-a", count: 4, count_completeness: "exact" }],
  applications: [{ id: "checkout", label: "Checkout", count: 3, count_completeness: "partial" }],
  resource_types: [{ id: "pod", label: "Pod", count: 12, count_completeness: "exact" }],
  labels: [{ key: "team", value: "checkout", count: 2, count_completeness: "exact" }],
  resources: [{ id: "resource-a", label: "checkout-api", kind: "Deployment", count: 1, count_completeness: "exact" }],
};

describe("global filter facets API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes canonical common filters and validates grouped suggestions", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(payload),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(listGlobalFilterFacets({
      q: " check ",
      clusters: ["cluster-b", "cluster-a"],
      namespaces: ["cluster-a/shop"],
      applications: ["checkout"],
      resourceTypes: ["pod"],
      labels: ["team=checkout"],
    }, controller.signal)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/filter-facets?q=check&clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fshop&applications=checkout&resources.types=pod&labels=team%3Dcheckout",
      expect.objectContaining({ credentials: "include", signal: controller.signal }),
    );
  });
});
