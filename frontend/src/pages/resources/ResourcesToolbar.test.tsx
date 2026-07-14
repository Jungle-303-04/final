// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { ResourcesToolbar } from "./ResourcesToolbar";

afterEach(cleanup);

describe("ResourcesToolbar namespace filter", () => {
  it("reconciles an external namespace change without submitting it", async () => {
    const onNamespaceChange = vi.fn();
    const view = renderToolbar("shop", onNamespaceChange);
    const namespace = screen.getByRole("textbox", { name: "Namespace filter" });

    expect((namespace as HTMLInputElement).value).toBe("shop");
    view.rerender(<ToolbarHarness namespace="platform" onNamespaceChange={onNamespaceChange} />);

    await waitFor(() => expect((namespace as HTMLInputElement).value).toBe("platform"));
    expect(onNamespaceChange).not.toHaveBeenCalled();
  });

  it("trims a submitted namespace and maps a blank value to null", async () => {
    const user = userEvent.setup();
    const onNamespaceChange = vi.fn();
    renderToolbar(null, onNamespaceChange);
    const namespace = screen.getByRole("textbox", { name: "Namespace filter" });
    const apply = screen.getByRole("button", { name: "Apply" });

    await user.type(namespace, "  payments  ");
    await user.click(apply);
    expect(onNamespaceChange).toHaveBeenNthCalledWith(1, "payments");

    await user.clear(namespace);
    await user.type(namespace, "   ");
    await user.click(apply);
    expect(onNamespaceChange).toHaveBeenNthCalledWith(2, null);
  });
});

function renderToolbar(
  namespace: string | null,
  onNamespaceChange: (value: string | null) => void,
) {
  return render(
    <ToolbarHarness namespace={namespace} onNamespaceChange={onNamespaceChange} />,
  );
}

function ToolbarHarness({
  namespace,
  onNamespaceChange,
}: {
  namespace: string | null;
  onNamespaceChange: (value: string | null) => void;
}) {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <ResourcesToolbar
        includeDeleted={false}
        namespace={namespace}
        onIncludeDeletedChange={vi.fn()}
        onNamespaceChange={onNamespaceChange}
        onSearchChange={vi.fn()}
        search=""
      />
    </I18nProvider>
  );
}
