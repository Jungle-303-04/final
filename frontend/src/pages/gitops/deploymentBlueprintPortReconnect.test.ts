import type { OnConnectStartParams } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { DeploymentBlueprintEdge } from "./deploymentBlueprintTypes";
import { findPortReconnectEdge } from "./deploymentBlueprintPortReconnect";

const edges: DeploymentBlueprintEdge[] = [{
  id: "edge:prod",
  source: "deployment:checkout",
  sourceHandle: "output",
  target: "cluster:prod",
  targetHandle: "input",
}, {
  id: "edge:staging",
  source: "deployment:checkout",
  sourceHandle: "output",
  target: "cluster:staging",
  targetHandle: "input",
}];

function start(
  nodeId: string,
  handleType: "source" | "target",
  handleId: string,
): OnConnectStartParams {
  return { nodeId, handleType, handleId };
}

describe("findPortReconnectEdge", () => {
  it("keeps output drags available for adding a new connection", () => {
    expect(findPortReconnectEdge(
      [edges[0]],
      start("deployment:checkout", "source", "output"),
    )).toBeNull();
  });

  it("does not detach an output edge even when its peer has a higher layer", () => {
    expect(findPortReconnectEdge(
      edges,
      start("deployment:checkout", "source", "output"),
      ["cluster:prod", "cluster:staging"],
    )).toBeNull();
  });

  it("picks the existing edge when its input port is dragged", () => {
    expect(findPortReconnectEdge(
      edges,
      start("cluster:staging", "target", "input"),
    )?.id).toBe("edge:staging");
  });

  it("uses the highest source-node layer to disambiguate a shared input", () => {
    const fanInEdges: DeploymentBlueprintEdge[] = [edges[0], {
      id: "edge:orders-prod",
      source: "deployment:orders",
      sourceHandle: "output",
      target: "cluster:prod",
      targetHandle: "input",
    }];

    expect(findPortReconnectEdge(
      fanInEdges,
      start("cluster:prod", "target", "input"),
      ["deployment:checkout", "deployment:orders"],
    )?.id).toBe("edge:orders-prod");
  });

  it("falls back to the last rendered edge when node layers are unavailable", () => {
    const fanInEdges: DeploymentBlueprintEdge[] = [edges[0], {
      id: "edge:orders-prod",
      source: "deployment:orders",
      sourceHandle: "output",
      target: "cluster:prod",
      targetHandle: "input",
    }];

    expect(findPortReconnectEdge(
      fanInEdges,
      start("cluster:prod", "target", "input"),
    )?.id).toBe("edge:orders-prod");
  });
});
