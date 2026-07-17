// @vitest-environment jsdom

import { I18nProvider } from "../../shared/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeDiagnostics, RuntimeStatusPort } from "./runtimeStatusContract";
import { RuntimeDiagnosticsDialog } from "./RuntimeDiagnosticsDialog";
import { VersionUpdateNotice } from "./VersionUpdateNotice";

afterEach(() => document.body.replaceChildren());

describe("runtime status shell controls", () => {
  it("keeps version loading and failures non-intrusive and shows a safe update notice", async () => {
    const checkVersion = vi.fn().mockResolvedValue({
      availability: "available",
      currentVersion: "1.2.0",
      latestVersion: "1.3.0",
      updateAvailable: true,
      releaseUrl: "https://example.test/releases/1.3.0",
      releaseNotes: "Release notes",
      observedAt: "2026-07-17T07:00:00Z",
      reasonCodes: [],
    });

    renderControl(<VersionUpdateNotice port={port({ checkVersion })} />);

    expect(screen.queryByRole("link", { name: /1\.3\.0/u })).toBeNull();
    const notice = await screen.findByRole("link", { name: /1\.3\.0/u });
    expect(notice.getAttribute("href")).toBe("https://example.test/releases/1.3.0");
    expect(checkVersion).toHaveBeenCalledOnce();
  });

  it("loads diagnostics only when opened and supports loading, Escape close, and focus return", async () => {
    const deferred = promiseWithResolvers<RuntimeDiagnostics>();
    const loadDiagnostics = vi.fn().mockReturnValue(deferred.promise);
    const user = userEvent.setup();

    renderControl(<RuntimeDiagnosticsDialog port={port({ loadDiagnostics })} />);

    const trigger = screen.getByRole("button", { name: /runtime diagnostics/i });
    expect(loadDiagnostics).not.toHaveBeenCalled();
    await user.click(trigger);
    expect(loadDiagnostics).toHaveBeenCalledOnce();
    expect(screen.getByRole("status", { name: /loading runtime diagnostics/i })).toBeTruthy();

    deferred.resolve(diagnostics());
    expect(await screen.findByText("CPython 3.13.5")).toBeTruthy();
    expect(screen.getByText("production-a")).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("shows a retryable fail-safe state without exposing transport errors", async () => {
    const loadDiagnostics = vi.fn()
      .mockRejectedValueOnce(new Error("secret upstream details"))
      .mockResolvedValueOnce(diagnostics());
    const user = userEvent.setup();

    renderControl(<RuntimeDiagnosticsDialog port={port({ loadDiagnostics })} />);
    await user.click(screen.getByRole("button", { name: /runtime diagnostics/i }));

    expect(await screen.findByText(/could not load runtime diagnostics/i)).toBeTruthy();
    expect(screen.queryByText(/secret upstream details/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("CPython 3.13.5")).toBeTruthy();
    expect(loadDiagnostics).toHaveBeenCalledTimes(2);
  });
});

function renderControl(node: React.ReactNode) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      {node}
    </I18nProvider>,
  );
}

function port(overrides: Partial<RuntimeStatusPort> = {}): RuntimeStatusPort {
  return {
    loadDiagnostics: vi.fn().mockResolvedValue(diagnostics()),
    checkVersion: vi.fn().mockResolvedValue({
      availability: "unavailable",
      currentVersion: "1.2.0",
      latestVersion: null,
      updateAvailable: null,
      releaseUrl: null,
      releaseNotes: null,
      observedAt: "2026-07-17T07:00:00Z",
      reasonCodes: ["release_provider_unavailable"],
    }),
    ...overrides,
  };
}

function diagnostics(): RuntimeDiagnostics {
  return {
    observedAt: "2026-07-17T07:00:00Z",
    completeness: "complete",
    runtime: {
      pythonVersion: "3.13.5",
      pythonImplementation: "CPython",
      processId: 42,
      cpuCount: 12,
      threadCount: 8,
      uptimeSeconds: 125.5,
    },
    eventPipeline: {
      availability: "available",
      openDeadLetters: 0,
      outboxPending: 2,
      processingStatuses: [{ status: "processed", count: 20 }],
      consumerLag: [],
      reasonCodes: [],
    },
    timeline: {
      availability: "available",
      eventCount: 21,
      oldestOccurredAt: "2026-07-17T06:00:00Z",
      newestOccurredAt: "2026-07-17T07:00:00Z",
      highWaterSequence: 25,
      retainedFromSequence: 5,
      reasonCodes: [],
    },
    agentCollection: {
      availability: "available",
      items: [{
        clusterId: "cluster-a",
        name: "production-a",
        environment: "production",
        registrationStatus: "registered",
        connectionStatus: "online",
        agentId: "agent-a",
        agentStatus: "ready",
        lastSeenAt: "2026-07-17T06:59:59Z",
        capabilities: ["inventory"],
        latestInventory: {
          status: "complete",
          source: "agent",
          collectedAt: "2026-07-17T06:59:50Z",
          resourceCount: 104,
        },
      }],
      reasonCodes: [],
    },
    reasonCodes: [],
  };
}

function promiseWithResolvers<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
