import { describe, expect, it } from "vitest";
import { createResourcesAdapter } from "./createResourcesAdapter";
import {
  endpoints,
  RESOURCE_DETAIL,
} from "./createResourcesAdapter.testSupport";

describe("canonical Resources detail mapping", () => {
  it("maps only server-provided related resources and events", async () => {
    const dependencies = endpoints();
    const identity = {
      resourceType: "service",
      kind: "Service",
      namespace: "shop",
      name: "checkout",
    } as const;

    const result = await createResourcesAdapter(dependencies).loadResourceDetail(
      "cluster-1",
      identity,
    );

    expect(result).toMatchObject({
      clusterId: "cluster-1",
      identity,
      resource: {
        id: "resource:cluster-1/uid-service-1",
        resourceType: "service",
        facts: {
          type: "service",
          serviceType: "ClusterIP",
          clusterIp: "10.96.0.1",
          externalUrl: null,
          externalHosts: ["checkout.example.test"],
          selector: [
            { key: "app", value: "checkout" },
            { key: "revision", value: "3" },
          ],
          ports: [{
            name: "http",
            protocol: "TCP",
            port: 80,
            targetPort: "8080",
            nodePort: null,
          }],
        },
      },
      relatedCompleteness: "unknown",
      related: [{
        name: "pods",
        items: [{ id: "resource:cluster-1/uid-pod-1" }],
      }],
      eventsCompleteness: "unknown",
      events: [{
        id: "resource:cluster-1/uid-event-1",
        resourceType: "event",
        facts: {
          type: "event",
          eventType: "Normal",
          reason: "Updated",
          message: "Service updated",
          occurrenceCount: 2,
          firstSeenAt: "2026-07-12T09:30:00.000Z",
          lastSeenAt: "2026-07-12T09:59:00.000Z",
          reportingComponent: "service-controller",
          involvedResource: {
            kind: "Service",
            name: "checkout",
            uid: "uid-service-1",
          },
        },
      }],
    });
    expect(dependencies.getInventoryResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      identity,
      { relatedLimit: 100, eventLimit: 50 },
      undefined,
    );
    expect(result.related[0]?.items).toHaveLength(RESOURCE_DETAIL.related.pods?.length ?? 0);
    expect(result.events).toHaveLength(RESOURCE_DETAIL.events.length);
  });
});
