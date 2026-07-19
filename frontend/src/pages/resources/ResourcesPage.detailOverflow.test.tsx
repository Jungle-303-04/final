// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { POD_DETAIL, renderResources, resourcesPort } from "./ResourcesPage.testSupport";

afterEach(() => cleanup());

describe("ResourcesPage detail overflow", () => {
  it("keeps long identity, UID, and owner values single-line with full-value tooltips", async () => {
    renderLongDetail();
    const dialog = await screen.findByRole("dialog", { name: `${LONG_NAME} 상세` });
    const title = within(dialog).getByRole("heading", { level: 2 });
    const uid = await within(dialog).findByLabelText(LONG_UID);
    const owner = within(dialog).getByLabelText(`Deployment/${LONG_OWNER}`);

    expect(title.className).toContain("truncate");
    expect(title.textContent).not.toBe(`${LONG_NAME} 상세`);
    expect(uid.className).toContain("truncate");
    expect(owner.className).toContain("truncate");
    expect(title.closest("[data-slot=tooltip-trigger]")?.textContent ?? title.textContent).toBeTruthy();
  });

  it("keeps long related identities single-line and hover-recoverable", async () => {
    renderLongDetail();
    const dialog = await screen.findByRole("dialog", { name: `${LONG_NAME} 상세` });
    const related = await within(dialog).findByLabelText(
      `Service · ${LONG_NAMESPACE}/${LONG_RELATED_NAME}`,
    );
    expect(related.className).toContain("truncate");
  });

  it("keeps long event reasons and messages complete and wrap-safe", async () => {
    const user = userEvent.setup();
    renderLongDetail();
    const dialog = await screen.findByRole("dialog", { name: `${LONG_NAME} 상세` });
    await user.click(await within(dialog).findByRole("tab", { name: "이벤트 1" }));
    const reason = await within(dialog).findByLabelText(LONG_EVENT_REASON);
    const message = within(dialog).getByText(LONG_EVENT_MESSAGE);
    expect(reason.className).toContain("truncate");
    expect(message.className).toContain("[overflow-wrap:anywhere]");
  });
});

const LONG_NAME = `checkout-${"n".repeat(240)}`;
const LONG_NAMESPACE = `team-${"s".repeat(58)}`;
const LONG_UID = `uid-${"u".repeat(240)}`;
const LONG_OWNER = `owner-${"o".repeat(240)}`;
const LONG_RELATED_NAME = `service-${"r".repeat(240)}`;
const LONG_EVENT_REASON = `BackOff${"R".repeat(240)}`;
const LONG_EVENT_MESSAGE = `ContainerRestart${"M".repeat(480)}`;

const LONG_DETAIL: ResourceDetail = {
  ...POD_DETAIL,
  identity: { ...POD_DETAIL.identity, namespace: LONG_NAMESPACE, name: LONG_NAME },
  resource: {
    ...POD_DETAIL.resource,
    id: "pod:cluster-1/long/identity",
    inventoryKey: "pod:long/identity",
    namespace: LONG_NAMESPACE,
    name: LONG_NAME,
    uid: LONG_UID,
    facts: {
      type: "pod",
      phase: "Running",
      nodeName: `node-${"d".repeat(240)}`,
      owner: { kind: "Deployment", name: LONG_OWNER },
      readiness: { ready: 1, total: 1 },
      restartCount: 2,
      cpuMillicores: 250,
      memoryMebibytes: 384,
      podIp: null,
      hostIp: null,
      waitingReasons: [],
      terminatedReasons: [],
    },
  },
  related: [{
    name: "Selected by",
    items: [{
      ...POD_DETAIL.resource,
      id: "service:cluster-1/long/identity",
      inventoryKey: "service:long/identity",
      uid: `uid-${"v".repeat(240)}`,
      resourceType: "service",
      kind: "Service",
      namespace: LONG_NAMESPACE,
      name: LONG_RELATED_NAME,
      facts: {
        type: "service",
        serviceType: "ClusterIP",
        clusterIp: "10.96.0.10",
        externalUrl: null,
        externalHosts: [],
        selector: [],
        ports: [],
      },
    }],
  }],
  events: [{
    ...POD_DETAIL.events[0]!,
    id: "event:cluster-1/long/identity",
    inventoryKey: "event:long/identity",
    name: LONG_EVENT_REASON,
    facts: {
      type: "event",
      eventType: "Warning",
      reason: LONG_EVENT_REASON,
      message: LONG_EVENT_MESSAGE,
      occurrenceCount: 2,
      firstSeenAt: "2026-07-12T09:58:00.000Z",
      lastSeenAt: "2026-07-12T09:59:00.000Z",
      reportingComponent: "kubelet",
      involvedResource: { kind: "Pod", name: LONG_NAME, uid: LONG_UID },
    },
  }],
};

function renderLongDetail() {
  const port = resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(LONG_DETAIL) });
  const resource = encodeURIComponent(`${LONG_NAMESPACE}/${LONG_NAME}`);
  return renderResources(
    port,
    "/resources?clusters=cluster-1&resources.types=pod" +
      `&resource=${resource}&resourceKind=Pod`,
  );
}
