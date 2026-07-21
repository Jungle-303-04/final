// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  buildClusterTargetPreflightInput,
  buildClusterTargetRegisterInput,
  type ClusterTargetFields,
} from "./connectFeed";

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
    window.history.replaceState({}, "", "/devpreview-unified.html");
  });

  it("passes the complete AWS provider config through preflight and registration", () => {
    const preflightInput = buildClusterTargetPreflightInput(AWS_FIELDS);
    const registerInput = buildClusterTargetRegisterInput(AWS_FIELDS);

    expect(preflightInput).toEqual(expect.objectContaining({
      clusterId: "game-server-apne2",
      providerConfig: AWS_FIELDS.providerConfig,
    }));
    expect(registerInput).toEqual(expect.objectContaining({
      clusterId: "game-server-apne2",
      providerConfig: AWS_FIELDS.providerConfig,
    }));
  });

  it("uses the same normalized cluster identity for preflight and registration", () => {
    const preflightInput = buildClusterTargetPreflightInput(AWS_FIELDS);
    const registerInput = buildClusterTargetRegisterInput(AWS_FIELDS);
    expect(preflightInput.clusterId).toBe("game-server-apne2");
    expect(registerInput.clusterId).toBe(preflightInput.clusterId);
  });

  it("derives the terminal bootstrap fields without asking for AWS credentials in the browser", () => {
    const preflightInput = buildClusterTargetPreflightInput(AWS_DEFAULTED_FIELDS);
    const registerInput = buildClusterTargetRegisterInput(AWS_DEFAULTED_FIELDS);

    const expectedProviderConfig = {
      region: "ap-northeast-2",
      eks_cluster_name: "game-server",
      context_alias: "game-server",
    };
    expect(preflightInput.providerConfig).toEqual(expectedProviderConfig);
    expect(registerInput.providerConfig).toEqual(expectedProviderConfig);
  });
});
