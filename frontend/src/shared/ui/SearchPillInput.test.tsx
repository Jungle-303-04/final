// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchPillInput, type SearchModifier } from "./SearchPillInput";

afterEach(cleanup);

describe("SearchPillInput", () => {
  it("keeps every filter in one horizontal input row", () => {
    render(
      <Harness
        initialPills={[
          { key: "cluster", value: "cluster-1" },
          { key: "ns", value: "default" },
          { key: "kind", value: "Pod" },
          { key: "label", value: "team=platform" },
        ]}
      />,
    );

    const control = document.querySelector('[data-slot="search-pill-input"]');
    expect(control?.className).toContain("overflow-x-auto");
    expect(control?.className).not.toContain("flex-wrap");
    expect(screen.getByText("team=platform")).toBeTruthy();
  });

  it("uses the shared identifier-safe input policy for structured filters", () => {
    render(<Harness initialPills={[]} />);

    const input = screen.getByRole("textbox", { name: "필터 추가" });
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
  });

  it("returns the last filter to the input when backspace is pressed", async () => {
    const user = userEvent.setup();
    render(<Harness initialPills={[{ key: "kind", value: "Pod" }]} />);

    const input = screen.getByRole("textbox", { name: "필터 추가" });
    await user.click(input);
    await user.keyboard("{Backspace}");

    expect((input as HTMLInputElement).value).toBe("kind:Pod");
    expect(screen.queryByRole("button", { name: "Pod 필터 제거" })).toBeNull();
  });

  it("commits a matching modifier suggestion", async () => {
    const user = userEvent.setup();
    render(<Harness initialPills={[]} />);

    const input = screen.getByRole("textbox", { name: "필터 추가" });
    await user.type(input, "kind:po");
    await user.click(await screen.findByRole("button", { name: "Pod" }));

    expect(screen.getByText("Pod")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
  });
});

function Harness({ initialPills }: { initialPills: SearchModifier[] }) {
  const [value, setValue] = useState({ text: "", pills: initialPills });
  return (
    <SearchPillInput
      aria-label="필터 추가"
      className="h-9 rounded-lg border px-2"
      getRemovePillLabel={(pill) => `${pill.value} 필터 제거`}
      modifierOptions={{ kind: ["Pod", "Deployment", "Service"] }}
      onChange={setValue}
      pills={value.pills}
      text={value.text}
    />
  );
}
