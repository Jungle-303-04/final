// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderGitOps } from "./GitOpsPage.testSupport";

afterEach(cleanup);

describe("deploy GitOps surface", () => {
  it("derives the compact summary from actual applications and sync observations", async () => {
    renderGitOps("/deploy");

    expect(await screen.findByText("Applications")).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
    expect(screen.getByText("OutOfSync")).toBeTruthy();
    expect(screen.getByText("Git repository")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect repository" })).toBeNull();
  });

  it("uses the repository section as the single connection and sync-status path", async () => {
    const user = userEvent.setup();
    renderGitOps("/deploy?section=repositories");

    expect(await screen.findByText("team/checkout-api")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect repository" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New deployment target" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Details: team/checkout-api" }));
    const application = (await screen.findByText("Checkout API")).closest("li");
    expect(application).not.toBeNull();
    expect(within(application as HTMLLIElement).getByText("81de44f")).toBeTruthy();
  });
});
