// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HelmPortFailure,
  type HelmPort,
  type HelmChartSource,
} from "../../features/helm/helmContract";
import { HelmChartSourcesPanel } from "./HelmChartSourcesPanel";

afterEach(() => cleanup());

describe("HelmChartSourcesPanel", () => {
  it("renders repository and OCI sources from the port without unsafe identity fields", async () => {
    const port = helmPort();
    render(<HelmChartSourcesPanel port={port} />);

    expect(await screen.findByRole("heading", { name: "Chart sources" })).toBeTruthy();
    expect(screen.getByText("Stable")).toBeTruthy();
    expect(screen.getByText("Private OCI")).toBeTruthy();
    expect(screen.getByText("Repository")).toBeTruthy();
    expect(screen.getByText("OCI")).toBeTruthy();
    expect(screen.queryByText(/workspace-a|credential-ref|private-token/)).toBeNull();
  });

  it("shows loading, empty, and retryable failure states inside the source section", async () => {
    const loadingPort = helmPort();
    loadingPort.listChartSources.mockReturnValue(new Promise(() => undefined));
    const loading = render(<HelmChartSourcesPanel port={loadingPort} />);
    expect(screen.getByRole("status", { name: "Loading chart sources" })).toBeTruthy();
    loading.unmount();

    const emptyPort = helmPort();
    emptyPort.listChartSources.mockResolvedValue(sourcePage([]));
    const empty = render(<HelmChartSourcesPanel port={emptyPort} />);
    expect(await screen.findByText("No chart sources are registered for this workspace.")).toBeTruthy();
    empty.unmount();

    const failedPort = helmPort();
    failedPort.listChartSources
      .mockRejectedValueOnce(new HelmPortFailure("offline"))
      .mockResolvedValueOnce(sourcePage([source()]));
    render(<HelmChartSourcesPanel port={failedPort} />);
    expect(await screen.findByText("Chart sources cannot be reached right now.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry chart sources" }));
    expect(await screen.findByText("Stable")).toBeTruthy();
    expect(failedPort.listChartSources).toHaveBeenCalledTimes(2);
  });

  it("registers a basic-auth OCI source, clears secrets, closes, and refetches", async () => {
    const user = userEvent.setup();
    const port = helmPort();
    render(<HelmChartSourcesPanel port={port} />);

    await screen.findByText("Stable");
    await user.click(screen.getByRole("button", { name: "Register chart source" }));
    const dialog = screen.getByRole("dialog", { name: "Register chart source" });
    expect(dialog).toBeTruthy();

    await user.selectOptions(screen.getByRole("combobox", { name: "Source type" }), "oci");
    await user.type(screen.getByRole("textbox", { name: "Source name" }), "Private OCI");
    await user.type(screen.getByRole("textbox", { name: "Source reference" }), "registry.example.test/team/charts");
    await user.selectOptions(screen.getByRole("combobox", { name: "Authentication" }), "basic");
    await user.type(screen.getByRole("textbox", { name: "Username" }), "robot");
    const password = screen.getByLabelText("Password");
    await user.type(password, "private-password");
    await user.click(screen.getByRole("button", { name: "Save chart source" }));

    await waitFor(() => expect(port.registerChartSource).toHaveBeenCalledWith({
      provider: "oci",
      name: "Private OCI",
      reference: "registry.example.test/team/charts",
      credential: { kind: "basic", username: "robot", password: "private-password" },
    }, expect.any(AbortSignal)));
    await waitFor(() => expect(port.listChartSources).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog", { name: "Register chart source" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Register chart source" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Authentication" }), "basic");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement).value).toBe("");
  });

  it("clears a rejected bearer token and keeps a safe permission error in the dialog", async () => {
    const user = userEvent.setup();
    const port = helmPort();
    port.registerChartSource.mockRejectedValue(new HelmPortFailure("forbidden"));
    render(<HelmChartSourcesPanel port={port} />);

    await screen.findByText("Stable");
    await user.click(screen.getByRole("button", { name: "Register chart source" }));
    await user.type(screen.getByRole("textbox", { name: "Source name" }), "Private stable");
    await user.type(screen.getByRole("textbox", { name: "Source reference" }), "https://charts.example.test/private/index.yaml");
    await user.selectOptions(screen.getByRole("combobox", { name: "Authentication" }), "bearer");
    const token = screen.getByLabelText("Bearer token");
    await user.type(token, "private-token");
    await user.click(screen.getByRole("button", { name: "Save chart source" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "You are not authorized to register chart sources in this workspace.",
    );
    expect((token as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("private-token")).toBeNull();
    expect(port.listChartSources).toHaveBeenCalledTimes(1);
  });

  it("loads the next server page without replacing already observed sources", async () => {
    const user = userEvent.setup();
    const port = helmPort();
    port.listChartSources
      .mockResolvedValueOnce({ ...sourcePage([source()]), hasMore: true, nextCursor: "page-2" })
      .mockResolvedValueOnce(sourcePage([source({ id: "source-oci", provider: "oci", name: "Private OCI" })]));
    render(<HelmChartSourcesPanel port={port} />);

    await user.click(await screen.findByRole("button", { name: "Load more chart sources" }));

    expect(await screen.findByText("Private OCI")).toBeTruthy();
    expect(screen.getByText("Stable")).toBeTruthy();
    expect(port.listChartSources).toHaveBeenLastCalledWith(
      { cursor: "page-2", limit: 50 },
      expect.any(AbortSignal),
    );
  });

  it("confirms an authorized delete with the listed identity and refetches after receipt", async () => {
    const user = userEvent.setup();
    const port = helmPort();
    render(<HelmChartSourcesPanel port={port} />);

    await user.click(await screen.findByRole("button", { name: "Delete Stable chart source" }));
    const dialog = screen.getByRole("dialog", { name: "Delete chart source" });
    expect(dialog.textContent).toContain("Stable");
    expect(dialog.textContent).toContain("https://charts.example.test/index.yaml");

    await user.click(screen.getByRole("button", { name: "Delete chart source permanently" }));

    await waitFor(() => expect(port.deleteChartSource).toHaveBeenCalledWith({
      id: "source-repository",
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
    }, expect.any(AbortSignal)));
    await waitFor(() => expect(port.listChartSources).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog", { name: "Delete chart source" })).toBeNull();
  });

  it("omits unauthorized delete actions and keeps a safe forbidden error in confirmation", async () => {
    const user = userEvent.setup();
    const port = helmPort();
    port.listChartSources.mockResolvedValue(sourcePage([
      source({ actions: [] }),
      source({ id: "source-oci", provider: "oci", name: "Private OCI", actions: ["delete"] }),
    ]));
    port.deleteChartSource.mockRejectedValue(new HelmPortFailure("forbidden"));
    render(<HelmChartSourcesPanel port={port} />);

    await screen.findByText("Stable");
    expect(screen.queryByRole("button", { name: "Delete Stable chart source" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete Private OCI chart source" }));
    await user.click(screen.getByRole("button", { name: "Delete chart source permanently" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "You are not authorized to delete this chart source.",
    );
    expect(screen.getByRole("dialog", { name: "Delete chart source" })).toBeTruthy();
    expect(port.listChartSources).toHaveBeenCalledTimes(1);
  });
});

function helmPort(): HelmPort & {
  listChartSources: ReturnType<typeof vi.fn>;
  registerChartSource: ReturnType<typeof vi.fn>;
  deleteChartSource: ReturnType<typeof vi.fn>;
} {
  return {
    listReleases: vi.fn(),
    getRelease: vi.fn(),
    readArtifact: vi.fn(),
    upgradeRelease: vi.fn(),
    deleteChartSource: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "event-delete-source",
      correlationId: "correlation-delete-source",
    }),
    listChartSources: vi.fn().mockResolvedValue(sourcePage([
      source(),
      source({
        id: "source-oci",
        provider: "oci",
        name: "Private OCI",
        reference: "registry.example.test/team/charts",
        credentialsConfigured: true,
        observedAt: null,
      }),
    ])),
    registerChartSource: vi.fn().mockResolvedValue(source({
      id: "source-oci",
      provider: "oci",
      name: "Private OCI",
      reference: "registry.example.test/team/charts",
      credentialsConfigured: true,
      observedAt: null,
    })),
  };
}

function sourcePage(items: HelmChartSource[]) {
  return { items, limit: 50, hasMore: false, nextCursor: null };
}

function source(overrides: Partial<HelmChartSource> = {}): HelmChartSource {
  return {
    id: "source-repository",
    provider: "repository",
    name: "Stable",
    reference: "https://charts.example.test/index.yaml",
    status: "active",
    actions: ["delete"],
    credentialsConfigured: false,
    observedAt: "2026-07-17T08:00:00Z",
    ...overrides,
  };
}
