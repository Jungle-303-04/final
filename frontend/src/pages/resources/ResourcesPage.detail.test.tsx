// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ResourcesPortFailure,
  type ResourceDetail,
} from "../../features/resources/resourcesContract";
import {
  deferred,
  POD_DETAIL,
  renderResources,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import { encodeResourceTarget } from "./resourcesUrlState";

beforeEach(resetDocumentTestClock);

afterEach(() => {
  cleanup();
  resetDocumentTestClock();
});

describe("ResourcesPage URL-backed detail", () => {
  it("keeps detail loading inside the sheet without nesting a page frame", async () => {
    const detail = deferred<typeof POD_DETAIL>();
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockReturnValue(detail.promise),
    });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&resource=shop%2Fcheckout-api-0&resourceKind=Pod",
    );

    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    expect(dialog.querySelector('[data-slot="resource-detail-loading"]')).toBeTruthy();
    expect(dialog.querySelector('[data-slot="product-page-frame"]')).toBeNull();

    await waitFor(
      () => expect(port.loadResourceDetail).toHaveBeenCalledOnce(),
      { timeout: 5_000 },
    );
    detail.resolve(POD_DETAIL);
    expect(await within(dialog).findByText("Running", {}, { timeout: 5_000 })).toBeTruthy();
  }, 15_000);

  it("resolves a direct same-route detail deep link from canonical identity", async () => {
    const list = deferred<Awaited<ReturnType<ReturnType<typeof resourcesPort>["listResources"]>>>();
    const port = resourcesPort({ listResources: vi.fn().mockReturnValue(list.promise) });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&resource=shop%2Fcheckout-api-0&resourceKind=Pod",
    );

    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    await waitFor(() => expect(dialog.textContent).toContain("Running"));
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      {
        resourceType: "pod",
        kind: "Pod",
        namespace: "shop",
        name: "checkout-api-0",
      },
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId("resources-location").textContent)
      .toContain("resource=v1%2Fcluster-1%2Fpod%2Fshop%2Fcheckout-api-0");
  });

  it("isolates a cross-Cluster forbidden detail without blanking the selected list", async () => {
    const target = encodeResourceTarget("kubernetes-ops", {
      resourceType: "pod",
      kind: "Pod",
      namespace: "ops",
      name: "restricted-agent",
    });
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockRejectedValue(new ResourcesPortFailure("forbidden")),
    });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      `&resource=${encodeURIComponent(target.resource)}&resourceKind=Pod`,
    );

    expect(await screen.findByRole("table", { hidden: true, name: "리소스 목록" }))
      .toBeTruthy();
    const dialog = await screen.findByRole("dialog", { name: "restricted-agent 상세" });
    expect(within(dialog).getByRole("heading", { name: "이 범위에 접근할 수 없습니다" }))
      .toBeTruthy();
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "kubernetes-ops",
      expect.objectContaining({ name: "restricted-agent", resourceType: "pod" }),
      expect.any(AbortSignal),
    );
  });

  it("keeps the list and renders a scoped not-found detail state", async () => {
    const port = resourcesPort({
      loadResourceDetail: vi.fn().mockRejectedValue(new ResourcesPortFailure("not-found")),
    });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&resource=shop%2Fmissing&resourceKind=Pod",
    );

    expect(await screen.findByText("checkout-api-0", {}, { timeout: 5_000 })).toBeTruthy();
    const dialog = await screen.findByRole("dialog", { name: "missing 상세" });
    expect(dialog.textContent).toContain("리소스를 찾을 수 없습니다");
    expect(screen.getByRole("button", { name: "상세 닫기" })).toBeTruthy();
  }, 15_000);

  it("closes the detail in place, removes its URL identity, and restores row focus", async () => {
    const user = userEvent.setup();
    const port = resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(POD_DETAIL) });
    renderResources(port, "/resources?clusters=cluster-1&resources.types=pod");

    const table = await screen.findByRole("table", { name: "리소스 목록" });
    const row = within(table).getByRole("button", { name: /checkout-api-0/u });
    await user.click(row);
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 상세" }, { timeout: 5_000 }))
      .toBeTruthy();
    expect(screen.getByTestId("resources-location").textContent).toContain("resource=");

    await user.click(screen.getByRole("button", { name: "상세 닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("resources-location").textContent).not.toContain("resource=");
    await waitFor(() => expect(document.activeElement).toBe(row));
  }, 15_000);

  it("renders long identity, UID, and owner values as complete wrap-safe text", async () => {
    const port = resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(LONG_DETAIL) });
    renderResources(port, longDetailUrl());

    const dialog = await screen.findByRole("dialog", { name: `${LONG_NAME} 상세` });
    const title = within(dialog).getByRole("heading", { name: `${LONG_NAME} 상세` });
    const uid = await within(dialog).findByText(LONG_UID);
    const owner = within(dialog).getByText(`Deployment/${LONG_OWNER}`);

    expect(title.className).toContain("[overflow-wrap:anywhere]");
    expect(uid.closest("dd")?.className).toContain("[overflow-wrap:anywhere]");
    expect(owner.closest("dd")?.className).toContain("[overflow-wrap:anywhere]");
    expect(owner.closest("dd")?.className).not.toContain("truncate");
  });

  it("keeps long related identities complete and wrap-safe", async () => {
    const user = userEvent.setup();
    const port = resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(LONG_DETAIL) });
    renderResources(port, longDetailUrl());

    const dialog = await screen.findByRole("dialog", { name: `${LONG_NAME} 상세` });
    await user.click(await within(dialog).findByRole("tab", { name: "관계 1" }));
    const related = await within(dialog).findByText(
      `Service · ${LONG_NAMESPACE}/${LONG_RELATED_NAME}`,
    );

    expect(related.className).toContain("[overflow-wrap:anywhere]");
    expect(related.className).not.toContain("truncate");
  });

  it("keeps long event reasons and messages complete and wrap-safe", async () => {
    const user = userEvent.setup();
    const port = resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(LONG_DETAIL) });
    renderResources(port, longDetailUrl());

    const dialog = await screen.findByRole("dialog", { name: `${LONG_NAME} 상세` });
    await user.click(await within(dialog).findByRole("tab", { name: "이벤트 1" }));
    const reason = await within(dialog).findByText(LONG_EVENT_REASON);
    const message = within(dialog).getByText(LONG_EVENT_MESSAGE);

    expect(reason.className).toContain("[overflow-wrap:anywhere]");
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
  identity: {
    ...POD_DETAIL.identity,
    namespace: LONG_NAMESPACE,
    name: LONG_NAME,
  },
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

function longDetailUrl(): string {
  const resource = encodeURIComponent(`${LONG_NAMESPACE}/${LONG_NAME}`);
  return "/resources?clusters=cluster-1&resources.types=pod" +
    `&resource=${resource}&resourceKind=Pod`;
}

function resetDocumentTestClock() {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}
