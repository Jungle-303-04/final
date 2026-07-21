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

const AWS_DEFAULTED_FIELDS: ClusterTargetFields = {
  cloudProvider: "eks",
  deployProvider: "manual-manifest",
  name: "game-server",
  environment: "prod",
  providerConfig: {},
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

  it("derives the terminal bootstrap fields without asking for AWS credentials in the browser", () => {
    void preflightClusterTarget(AWS_DEFAULTED_FIELDS);
    void registerClusterTarget(AWS_DEFAULTED_FIELDS);

    const expectedProviderConfig = {
      region: "ap-northeast-2",
      eks_cluster_name: "game-server",
      context_alias: "game-server",
    };
    expect(vi.mocked(preflightTargetRegistration).mock.calls[0]?.[0].providerConfig)
      .toEqual(expectedProviderConfig);
    expect(vi.mocked(registerTarget).mock.calls[0]?.[0].providerConfig)
      .toEqual(expectedProviderConfig);
  });
});
