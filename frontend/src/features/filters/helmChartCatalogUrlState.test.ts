import { describe, expect, it } from "vitest";

import {
  parseHelmChartCatalogUrlState,
  writeHelmChartCatalogSearchParams,
} from "./helmChartCatalogUrlState";

describe("Helm chart catalog URL state", () => {
  it("round-trips search, source, provider, all-version, and exact detail identity", () => {
    const written = writeHelmChartCatalogSearchParams(new URLSearchParams("keep=1"), {
      query: "redis cache",
      sourceId: "helm-source-a",
      provider: "repository",
      allVersions: true,
      selectedChart: "redis",
      selectedVersion: "2.0.0+build.1",
    });

    expect(written.get("keep")).toBe("1");
    expect(parseHelmChartCatalogUrlState(written)).toEqual({
      query: "redis cache",
      sourceId: "helm-source-a",
      provider: "repository",
      allVersions: true,
      selectedChart: "redis",
      selectedVersion: "2.0.0+build.1",
    });
  });

  it("drops malformed or incomplete detail identity without altering unrelated URL state", () => {
    const parsed = parseHelmChartCatalogUrlState(new URLSearchParams(
      "helmChartSource=../other&helmChart=redis&helmChartVersion=latest&helmChartProvider=invalid&keep=1",
    ));

    expect(parsed).toEqual({
      query: "",
      sourceId: null,
      provider: null,
      allVersions: false,
      selectedChart: null,
      selectedVersion: null,
    });
  });
});
