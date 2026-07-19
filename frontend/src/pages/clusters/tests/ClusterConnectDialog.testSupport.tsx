import { render } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthSessionGateProvider } from "../../../features/auth/AuthSessionGate";
import type { ClustersPort } from "../../../features/clusters/clustersContract";
import { UnifiedFilterProvider } from "../../../features/filters/UnifiedFilterProvider";
import { I18nProvider, useI18n } from "../../../shared/i18n";
import { ClusterConnectDialog } from "../ClusterConnectDialog";

export function waitingPort(): ClustersPort {
  return {
    connect: vi.fn(async () => ({
      clusterId: "production-a1b2",
      installCommand: "curl secret-command | kubectl apply -f -",
      expiresAt: "2026-07-14T06:00:00Z",
    })),
    loadConnection: vi.fn(async () => ({
      status: "waiting" as const,
      stage: "awaiting_install" as const,
      refreshAfterSeconds: 0.5,
      agentVersion: null,
      lastSeenAt: null,
    })),
    reissue: vi.fn(async () => ({
      clusterId: "production-a1b2",
      installCommand: "curl rotated-command | kubectl apply -f -",
      expiresAt: "2026-07-15T07:00:00Z",
    })),
  };
}

export function renderDialog(
  port: ClustersPort,
  onConnected = vi.fn(),
  existingNames: readonly string[] = [],
) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <MemoryRouter>
          <UnifiedFilterProvider>
            <ClusterConnectDialog
              existingNames={existingNames}
              onConnected={onConnected}
              onOpenChange={vi.fn()}
              open
              port={port}
            />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </AuthSessionGateProvider>
    </I18nProvider>,
  );
}

export function renderHarness(
  port: ClustersPort,
  onConnected = vi.fn(),
  onRegistered = vi.fn(),
) {
  return render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <MemoryRouter>
          <UnifiedFilterProvider>
            <ConnectionHarness
              onConnected={onConnected}
              onRegistered={onRegistered}
              port={port}
            />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </AuthSessionGateProvider>
    </I18nProvider>,
  );
}

function ConnectionHarness({
  onConnected,
  onRegistered,
  port,
}: {
  onConnected: () => void;
  onRegistered: () => void;
  port: ClustersPort;
}) {
  const [open, setOpen] = useState(true);
  const { t } = useI18n();
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        {t("clusters.connect.title")}
      </button>
      <ClusterConnectDialog
        existingNames={[]}
        onConnected={onConnected}
        onRegistered={onRegistered}
        onOpenChange={setOpen}
        open={open}
        port={port}
      />
    </>
  );
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}
