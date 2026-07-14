// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { WorkflowViewSettings } from "./WorkflowViewSettings";

afterEach(cleanup);

describe("WorkflowViewSettings", () => {
  it("keeps view settings available on a narrow canvas", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <WorkflowViewSettings
          compact={false}
          direction="LR"
          setCompact={vi.fn()}
          setDirection={vi.fn()}
          setShowCheckpoints={vi.fn()}
          setShowMetadata={vi.fn()}
          showCheckpoints
          showMetadata
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "View settings" }));
    expect(await screen.findByRole("dialog", { name: "View settings" })).toBeTruthy();
  });
});
