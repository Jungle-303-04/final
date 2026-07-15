// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { ResourcesLiveStatus } from "./ResourcesLiveStatus";
import type { PhysicalTopologyLiveState } from "./usePhysicalTopologyRealtime";

afterEach(cleanup);

describe("ResourcesLiveStatus", () => {
  it("shows the measured live interval and a human-readable degraded reason", () => {
    renderStatus({
      status: "connected",
      actualIntervalSeconds: 1.04,
      degradedReason: "kubelet_stats_forbidden",
      source: "metrics_server_fallback",
      updatedAt: Date.now(),
    });

    expect(screen.getByText("라이브 · 1초")).toBeTruthy();
    expect(screen.getByText("노드 직접 측정을 사용할 수 없어 보조 측정 중")).toBeTruthy();
    expect(screen.getByText(/업데이트/u)).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-live-status"]')
      ?.getAttribute("data-updated-at")).toBeTruthy();
  });

  it.each([
    ["connecting", "라이브 연결 중"],
    ["reconnecting", "라이브 재연결 중"],
    ["disconnected", "라이브 연결 끊김"],
  ] as const)("shows %s state", (status, label) => {
    renderStatus({
      status,
      actualIntervalSeconds: null,
      degradedReason: null,
      source: null,
      updatedAt: 0,
    });

    expect(screen.getByText(label)).toBeTruthy();
  });
});

function renderStatus(state: PhysicalTopologyLiveState) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <ResourcesLiveStatus state={state} />
    </I18nProvider>,
  );
}
