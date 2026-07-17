// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceFilesPort } from "../../features/resource-files/resourceFilesContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { POD_DETAIL } from "./ResourcesPage.testFixtures";
import { ResourceFilesystemBrowser } from "./ResourceFilesystemBrowser";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";

const DETAIL: ResourceDetail = {
  ...POD_DETAIL,
  resource: {
    ...POD_DETAIL.resource,
    apiVersion: "v1",
    uid: "pod-uid-1",
    facts: {
      type: "pod",
      phase: "Running",
      nodeName: "worker-a",
      owner: null,
      readiness: { ready: 1, total: 1 },
      restartCount: 0,
      cpuMillicores: null,
      memoryMebibytes: null,
      podIp: null,
      hostIp: null,
      waitingReasons: [],
      terminatedReasons: [],
      containerNames: ["app"],
    },
  },
};

const CAPABILITIES: ResourceCapabilitiesFrame = {
  phase: "ready",
  failure: null,
  data: {
    subject: {
      resourceId: DETAIL.resource.inventoryKey,
      snapshotId: "snapshot-42",
      clusterId: DETAIL.clusterId,
      resourceType: "pod",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
    },
    revision: "a".repeat(64),
    capabilities: [
      capability("image.filesystem", "Image files"),
      capability("pod.filesystem", "Pod files"),
    ],
  },
};

afterEach(cleanup);

describe("ResourceFilesystemBrowser", () => {
  it("keeps URL state, keyboard dismissal, breadcrumb navigation, and filtering coherent", async () => {
    const user = userEvent.setup();
    const port: ResourceFilesPort = {
      run: vi.fn()
        .mockResolvedValueOnce(directory("/", [
          entry("etc", "/etc", "directory"),
          entry("README", "/README", "file"),
        ]))
        .mockResolvedValueOnce(directory("/etc", [
          entry("config.yaml", "/etc/config.yaml", "file"),
        ])),
      download: vi.fn(),
    };
    renderBrowser(port);

    await user.click(screen.getByRole("button", { name: "Pod 파일" }));
    expect(await screen.findByRole("dialog", { name: "Pod 파일 · checkout-api-0" })).toBeTruthy();
    expect(window.location.search).toContain("files=pod");
    await user.click(await screen.findByRole("button", { name: "etc" }));
    expect(await screen.findByText("config.yaml")).toBeTruthy();
    expect(window.location.search).toContain("filePath=%2Fetc");
    await user.type(screen.getByRole("searchbox", { name: "파일 필터" }), "config");
    expect(screen.getByText("config.yaml")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).not.toContain("files=");
  });

  it("shows partial failures without replacing a previously observed directory", async () => {
    const user = userEvent.setup();
    const port: ResourceFilesPort = {
      run: vi.fn()
        .mockResolvedValueOnce(directory("/", [entry("etc", "/etc", "directory")]))
        .mockRejectedValueOnce(new Error("agent disconnected")),
      download: vi.fn(),
    };
    renderBrowser(port);

    await user.click(screen.getByRole("button", { name: "Pod 파일" }));
    await user.click(await screen.findByRole("button", { name: "etc" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("agent disconnected");
    expect(screen.getByRole("button", { name: "etc" })).toBeTruthy();
  });
});

function renderBrowser(port: ResourceFilesPort) {
  window.history.replaceState(null, "", "/resources");
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <ResourceFilesystemBrowser
        capabilities={CAPABILITIES}
        detail={DETAIL}
        port={port}
      />
    </I18nProvider>,
  );
}

function capability(capabilityId: string, label: string) {
  return {
    capabilityId,
    label,
    description: label,
    execution: "resource-files" as const,
    confirmationRequired: true,
    realtime: true,
    inputSchema: [],
    method: "POST" as const,
    path: "/api/resource-files/commands",
    requestContext: "exact-resource" as const,
    resultIntent: "resource-files" as const,
  };
}

function entry(name: string, path: string, type: "directory" | "file") {
  return {
    name,
    path,
    type,
    size: type === "file" ? 12 : 0,
    permissions: type === "file" ? "-rw-r--r--" : "drwxr-xr-x",
    modifiedAt: null,
    linkTarget: null,
  } as const;
}

function directory(path: string, entries: ReturnType<typeof entry>[]) {
  return {
    operation: "pod.list" as const,
    path,
    entries,
    cursor: 0,
    nextCursor: null,
    totalEntries: entries.length,
    truncated: false,
    artifactId: null,
  };
}
