// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  preflightTargetRegistration,
  registerTarget,
} from "../api/cluster-registration";
import {
  preflightClusterTarget,
  registerClusterTarget,
  type ClusterTargetFields,
} from "./connectFeed";

vi.mock("../api/cluster-registration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/cluster-registration")>();
  return {
    ...actual,
    preflightTargetRegistration: vi.fn(),
    registerTarget: vi.fn(),
  };
});

const AWS_FIELDS: ClusterTargetFields = {
  cloudProvider: "eks",
  deployProvider: "manual-manifest",
  name: "Game Server APNE2",
  environment: "prod",
  providerConfig: {
    region: "ap-northeast-2",
    eks_cluster_name: "demo-game-server",
    context_alias: "game-server",
  },
};

describe("devpreview cluster registration adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/devpreview-unified.html");
  });

  it("passes the complete AWS provider config through preflight and registration", () => {
    void preflightClusterTarget(AWS_FIELDS);
    void registerClusterTarget(AWS_FIELDS);

    expect(preflightTargetRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        clusterId: "game-server-apne2",
        providerConfig: AWS_FIELDS.providerConfig,
      }),
      undefined,
    );
    expect(registerTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        clusterId: "game-server-apne2",
        providerConfig: AWS_FIELDS.providerConfig,
      }),
      undefined,
    );
  });

  it("uses the same normalized cluster identity for preflight and registration", () => {
    void preflightClusterTarget(AWS_FIELDS);
    void registerClusterTarget(AWS_FIELDS);

    const preflightInput = vi.mocked(preflightTargetRegistration).mock.calls[0]?.[0];
    const registerInput = vi.mocked(registerTarget).mock.calls[0]?.[0];
    expect(preflightInput?.clusterId).toBe("game-server-apne2");
    expect(registerInput?.clusterId).toBe(preflightInput?.clusterId);
  });
});
