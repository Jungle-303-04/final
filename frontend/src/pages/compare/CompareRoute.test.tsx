// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import type { CompareCandidates, ComparePort, CompareResult } from "../../features/compare/compareContract";
import { I18nProvider } from "../../shared/i18n";
import { CompareRoute } from "./CompareRoute";

afterEach(cleanup);

describe("CompareRoute", () => {
  it("canonicalizes the resolved version and provides only safe presentation controls", async () => {
    const user = userEvent.setup();
    const port: ComparePort = {
      getComparison: vi.fn(async () => result()),
      getCandidates: vi.fn(async () => candidates()),
    };
    renderRoute(port);

    expect(await screen.findByRole("heading", { name: "Compare" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("apiVersion=v1"));
    await user.click(await screen.findByRole("button", { name: "Unified" }));
    expect(screen.getByLabelText("Unified comparison")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Differences only" }));
    expect(screen.getByText("spec.replicas")).toBeTruthy();

    const changeButtons = await screen.findAllByRole("button", { name: "Change" });
    await user.click(changeButtons[0]!);
    expect(await screen.findByRole("dialog", { name: "Choose side A resource" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "shop/api-c" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("a=shop%2Fapi-c"));
  });

  it("filters authorized candidates and supports IME-safe roving keyboard selection", async () => {
    const user = userEvent.setup();
    const port: ComparePort = {
      getComparison: vi.fn(async () => result()),
      getCandidates: vi.fn(async () => candidates()),
    };
    renderRoute(port);

    await screen.findByRole("heading", { name: "Compare" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("apiVersion=v1"));
    const changeButtons = await screen.findAllByRole("button", { name: "Change" });
    await user.click(changeButtons[0]!);
    const picker = await screen.findByRole("dialog", { name: "Choose side A resource" });
    const filter = screen.getByRole("combobox", { name: "Filter comparison candidates" });
    expect(filter.getAttribute("data-slot")).toBe("input");
    expect(picker.textContent).toContain("Candidate inventory is partial.");
    expect(screen.queryByRole("option", { name: "shop/api-a" })).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(3);

    fireEvent.keyDown(filter, { key: "Enter", isComposing: true, keyCode: 229 });
    expect(screen.getByTestId("location").textContent).not.toContain("a=shop%2Fapi-d");
    fireEvent.keyDown(filter, { key: "ArrowDown" });
    expect(filter.getAttribute("aria-activedescendant")).toContain("uid-c");
    fireEvent.keyDown(filter, { altKey: true, key: "ArrowDown" });
    expect(filter.getAttribute("aria-activedescendant")).toContain("uid-c");
    fireEvent.keyDown(filter, { key: "End" });
    expect(filter.getAttribute("aria-activedescendant")).toContain("uid-d");

    await user.type(filter, "api-d");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(filter, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("a=shop%2Fapi-d"));
  });

  it("keeps Escape local to the candidate picker", async () => {
    const user = userEvent.setup();
    const port: ComparePort = {
      getComparison: vi.fn(async () => result()),
      getCandidates: vi.fn(async () => candidates()),
    };
    renderRoute(port);

    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain("apiVersion=v1"));
    const changeButtons = await screen.findAllByRole("button", { name: "Change" });
    await user.click(changeButtons[1]!);
    const filter = await screen.findByRole("combobox", { name: "Filter comparison candidates" });
    fireEvent.keyDown(filter, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose side B resource" })).toBeNull());
    expect(screen.getByTestId("location").textContent).toContain("a=shop%2Fapi-a");
  });

  it("renders product-owned comparison copy in Korean", async () => {
    const port: ComparePort = {
      getComparison: vi.fn(async () => result()),
      getCandidates: vi.fn(async () => candidates()),
    };
    renderRoute(port, "ko-KR");

    expect(await screen.findByRole("heading", { name: "비교" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "차이만 보기" })).toBeTruthy();
    expect(await screen.findByLabelText("비교 설정")).toBeTruthy();
  });
});

function renderRoute(port: ComparePort, navigatorLanguage = "en-US") {
  return render(
    <I18nProvider navigatorLanguage={navigatorLanguage} storage={null}>
      <MemoryRouter initialEntries={["/compare?cluster=cluster-a&kind=deployments&apiGroup=apps&a=shop%2Fapi-a&b=shop%2Fapi-b"]}>
        <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
          <Routes>
            <Route element={<CompareRoute port={port} />} path="/compare" />
          </Routes>
          <LocationProbe />
        </AuthSessionGateProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function result(): CompareResult {
  return {
    scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["shop"], freshness: "live" },
    descriptor: {
      routeKind: "deployments",
      apiGroup: "apps",
      apiVersion: "v1",
      kubernetesKind: "Deployment",
      resourceType: "workload",
      projectionKind: "workload_replicas",
    },
    coverage: { availability: "partial", latestSnapshotId: "snapshot-a", reasonCodes: ["source_resources_incomplete"] },
    presentation: { modes: ["side-by-side", "unified"], swap: true, diffOnly: true },
    a: manifest("api-a", "uid-a", 2),
    b: manifest("api-b", "uid-b", 3),
  };
}

function candidates(): CompareCandidates {
  return {
    scope: result().scope,
    descriptor: result().descriptor,
    coverage: result().coverage,
    candidates: ["api-a", "api-b", "api-c", "api-d"].map((name) => ({
      resource: { apiGroup: "apps", version: "v1", kind: "Deployment", namespace: "shop", name, uid: `uid-${name.slice(-1)}` },
      provenance: {
        observationSnapshotId: "snapshot-a",
        latestSnapshotId: "snapshot-a",
        observedAt: "2026-07-16T09:00:00Z",
        availability: "available" as const,
        reasonCodes: [],
      },
    })),
    excludedCount: 0,
  };
}

function manifest(name: string, uid: string, replicas: number): CompareResult["a"] {
  return {
    resource: { apiGroup: "apps", version: "v1", kind: "Deployment", namespace: "shop", name, uid },
    metadata: { namespace: "shop", name },
    projection: { projectionKind: "workload_replicas", replicas },
    provenance: {
      observationSnapshotId: "snapshot-a",
      latestSnapshotId: "snapshot-a",
      observedAt: "2026-07-16T09:00:00Z",
      availability: "available",
      reasonCodes: [],
    },
    omittedPaths: [],
  };
}
