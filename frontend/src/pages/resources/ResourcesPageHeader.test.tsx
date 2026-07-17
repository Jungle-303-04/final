// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { ResourcesPageHeader } from "./ResourcesPageHeader";

afterEach(cleanup);

describe("ResourcesPageHeader", () => {
  it("makes the current cluster and resource scope explicit", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourcesPageHeader
          clusterName="prod-seoul"
          environment="production"
          resourceType="pod"
          visibleCount={2}
        >
          <span>Live</span>
        </ResourcesPageHeader>
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Pods overview");
    expect(screen.queryByText("Resource explorer")).toBeNull();
    expect(screen.getByText("prod-seoul")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
    expect(screen.getByText("2 visible")).toBeTruthy();
    expect(
      screen.getByText("Inspect Pods status and placement in the prod-seoul cluster."),
    ).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
  });
});
