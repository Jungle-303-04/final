// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { ResourcesToolbar } from "./ResourcesToolbar";

afterEach(cleanup);

describe("ResourcesToolbar", () => {
  it("keeps only the surface-specific inactive-resource toggle", async () => {
    const user = userEvent.setup();
    const onIncludeDeletedChange = vi.fn();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourcesToolbar
          includeDeleted={false}
          onIncludeDeletedChange={onIncludeDeletedChange}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("searchbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Include inactive resources" }));
    expect(onIncludeDeletedChange).toHaveBeenCalledWith(true);
  });

  it("describes the retained rows in user language", () => {
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesToolbar
          includeDeleted={false}
          onIncludeDeletedChange={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "종료된 리소스 포함" })).toBeTruthy();
    expect(screen.queryByText("비활성 포함")).toBeNull();
  });
});
