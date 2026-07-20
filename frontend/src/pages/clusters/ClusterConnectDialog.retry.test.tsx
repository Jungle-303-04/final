// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  renderDialog,
  waitingPort,
} from "./tests/ClusterConnectDialog.testSupport";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ClusterConnectDialog retries", () => {
  it("returns an initial registration failure to the preserved form before retrying registration", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    vi.mocked(port.connect)
      .mockRejectedValueOnce(new Error("temporary registration failure"))
      .mockResolvedValue({
        clusterId: "production-a1b2",
        installCommand: "curl secret-command | kubectl apply -f -",
        expiresAt: "2026-07-14T06:00:00Z",
      });
    renderDialog(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));
    expect(await screen.findByText("Could not create the connection")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("textbox", { name: "Cluster name" }).getAttribute("value"))
      .toBe("Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));

    expect(await screen.findByText("curl secret-command | kubectl apply -f -")).toBeTruthy();
    expect(port.connect).toHaveBeenCalledTimes(2);
  });

  it("retries only the failed connection check without registering a duplicate cluster", async () => {
    const user = userEvent.setup();
    const port = waitingPort();
    vi.mocked(port.loadConnection)
      .mockRejectedValueOnce(new Error("temporary connection status failure"))
      .mockResolvedValue({
        status: "connected",
        stage: "ready",
        refreshAfterSeconds: null,
        agentVersion: "2026.07.20",
        lastSeenAt: "2026-07-20T01:02:03Z",
      });
    renderDialog(port);

    await user.type(screen.getByRole("textbox", { name: "Cluster name" }), "Production");
    await user.click(screen.getByRole("button", { name: "Generate install command" }));
    expect(await screen.findByText("Could not create the connection")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Cluster connected")).toBeTruthy();
    expect(port.connect).toHaveBeenCalledOnce();
    expect(port.loadConnection).toHaveBeenCalledTimes(2);
  });
});
