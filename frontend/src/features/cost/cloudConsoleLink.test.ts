import { describe, expect, it } from "vitest";

import { cloudConsoleLink } from "./cloudConsoleLink";

describe("cloudConsoleLink", () => {
  it("derives allow-listed HTTPS links only from typed resource identity", () => {
    expect(cloudConsoleLink({
      provider: "aws",
      resourceType: "node",
      region: "ap-northeast-2",
      resourceId: "i-0123456789abcdef0",
    })).toEqual({
      provider: "aws",
      url: "https://ap-northeast-2.console.aws.amazon.com/ec2/home?region=ap-northeast-2#InstanceDetails:instanceId=i-0123456789abcdef0",
    });

    expect(cloudConsoleLink({
      provider: "gcp",
      resourceType: "cluster",
      projectId: "project-a",
      location: "asia-northeast3",
      resourceId: "cluster-a",
    })).toEqual({
      provider: "gcp",
      url: "https://console.cloud.google.com/kubernetes/clusters/details/asia-northeast3/cluster-a/details?project=project-a",
    });
  });

  it("blocks ambiguous identities and host-injection attempts", () => {
    expect(cloudConsoleLink(null)).toBeNull();
    expect(cloudConsoleLink({
      provider: "aws",
      resourceType: "node",
      region: "ap-northeast-2.evil.example",
      resourceId: "i-safe",
    })).toBeNull();
    expect(cloudConsoleLink({
      provider: "gcp",
      resourceType: "node",
      projectId: "project-a",
      location: "asia-northeast3-a",
      resourceId: "node/../../escape",
    })).toBeNull();
  });
});
