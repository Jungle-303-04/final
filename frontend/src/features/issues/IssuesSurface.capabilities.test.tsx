// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IssuesSurface } from "./IssuesSurface";
import { COPY, issuesPort, renderSurface } from "./IssuesSurface.testSupport";

afterEach(() => cleanup());

describe("IssuesSurface recovery capabilities", () => {
  it("disables recovery mutation when capability is not allowed", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "disabled", reason: "Read-only target" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    const action = await screen.findByRole("button", { name: "Increase memory limit" });
    expect(action.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Read-only target")).toBeTruthy();
    expect(port.selectRecoveryAction).not.toHaveBeenCalled();
  });
  it("hides a recovery mutation that is not meaningful for the target", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    await screen.findByText("selection_requested");
    expect(screen.queryByRole("button", { name: "Increase memory limit" })).toBeNull();
    expect(port.selectRecoveryAction).not.toHaveBeenCalled();
  });
});
