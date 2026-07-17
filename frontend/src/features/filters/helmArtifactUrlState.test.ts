import { describe, expect, it } from "vitest";

import {
  parseHelmArtifactUrlState,
  writeHelmArtifactSearchParams,
} from "./helmArtifactUrlState";

describe("Helm artifact URL state", () => {
  it("round-trips one resumable revision comparison while preserving shared filters", () => {
    const current = new URLSearchParams("clusters=cluster-1&query=redis");
    const written = writeHelmArtifactSearchParams(current, {
      revision: 3,
      comparisonRevision: 2,
      artifact: "hooks_diff",
      commandId: "cmd-helm-artifact-1",
      allValues: false,
    });

    expect(written.get("clusters")).toBe("cluster-1");
    expect(written.get("query")).toBe("redis");
    expect(parseHelmArtifactUrlState(written)).toEqual({
      revision: 3,
      comparisonRevision: 2,
      artifact: "hooks_diff",
      commandId: "cmd-helm-artifact-1",
      allValues: false,
    });
  });

  it("rejects unsafe command ids and incomplete diff cursors", () => {
    expect(parseHelmArtifactUrlState(new URLSearchParams(
      "helmRevision=3&helmArtifact=resources_diff&helmCommand=cmd/bad",
    ))).toEqual({
      revision: 3,
      comparisonRevision: null,
      artifact: "resources_diff",
      commandId: null,
      allValues: false,
    });
  });

  it("retains all-values only for value artifacts and deletes cleared fields", () => {
    const invalid = parseHelmArtifactUrlState(new URLSearchParams(
      "helmRevision=2&helmArtifact=manifest&helmCompare=1&helmAllValues=1",
    ));
    expect(invalid.comparisonRevision).toBe(1);
    expect(invalid.allValues).toBe(true);

    const cleared = writeHelmArtifactSearchParams(
      new URLSearchParams("helmRevision=2&helmCommand=cmd-1&clusters=cluster-1"),
      {
        revision: null,
        comparisonRevision: null,
        artifact: null,
        commandId: null,
        allValues: false,
      },
    );
    expect(cleared.toString()).toBe("clusters=cluster-1");
  });
});
