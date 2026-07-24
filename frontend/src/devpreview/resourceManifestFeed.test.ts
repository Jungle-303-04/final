import { describe, expect, it } from "vitest";

import { ApiError } from "../api/client";
import {
  isResourceManifestSourceStale,
  resourceManifestFailureText,
} from "./resourceManifestFeed";

describe("resourceManifestFeed stale source handling", () => {
  it.each(["manifest_source_stale", "manifest_source_revision_invalid"])(
    "recognizes %s as a recoverable source conflict",
    (code) => {
      const error = new ApiError("http", "stale", {
        status: 409,
        code,
        detail: "server detail",
      });

      expect(isResourceManifestSourceStale(error)).toBe(true);
      expect(resourceManifestFailureText(error)).toContain("편집 내용은 유지");
    },
  );

  it("does not classify unrelated conflicts as source staleness", () => {
    const error = new ApiError("http", "conflict", {
      status: 409,
      code: "approval_conflict",
    });

    expect(isResourceManifestSourceStale(error)).toBe(false);
  });
});
