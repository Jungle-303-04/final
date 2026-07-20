// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { DeployPage } from "./DeployPage";

afterEach(cleanup);

describe("DeployPage application composition", () => {
  it("renders the existing Applications surface once only on the applications tab", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/deploy"]}>
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <UnifiedFilterProvider>
            <DeployPage
              Applications={() => <div data-testid="applications-surface" />}
              GitOps={() => <div data-testid="gitops-surface" />}
              Helm={() => <div data-testid="helm-surface" />}
            />
          </UnifiedFilterProvider>
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId("applications-surface")).toHaveLength(1);
    expect(screen.getAllByTestId("gitops-surface")).toHaveLength(1);
    expect(screen.queryByTestId("helm-surface")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Repositories & sync" }));

    expect(screen.queryByTestId("applications-surface")).toBeNull();
    expect(screen.getAllByTestId("gitops-surface")).toHaveLength(1);

    await user.click(screen.getByRole("tab", { name: "Helm releases" }));

    expect(screen.queryByTestId("applications-surface")).toBeNull();
    expect(screen.getAllByTestId("helm-surface")).toHaveLength(1);
  });
});
