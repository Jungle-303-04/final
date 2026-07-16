// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MultiSelectPicker } from "./multi-select-picker";

afterEach(cleanup);

const items = [
  "Certificate",
  "CronWorkflow",
  "Deployment",
  "ScaledJob",
  "Service",
  "Workflow",
  "WorkflowTemplate",
];

function MultiSelectHarness({
  clearAllDisabled = false,
  itemsOverride = items,
  onDone = vi.fn(),
}: {
  clearAllDisabled?: boolean;
  itemsOverride?: readonly string[];
  onDone?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(["Deployment"]));

  return (
    <MultiSelectPicker
      clearAllAriaLabel="선택 전체 해제"
      clearAllDisabled={clearAllDisabled}
      items={itemsOverride}
      labels={{
        clearAll: "전체 해제",
        clearVisible: (count) => `표시 ${count}개 해제`,
        done: "완료",
        noMatches: "일치 항목 없음",
        selectAll: "모두 선택",
        selectVisible: (count) => `표시 ${count}개 선택`,
        selected: (count) => `${count}개 선택됨`,
      }}
      noItemsLabel="사용 가능한 항목 없음"
      onClearAll={() => setSelected(new Set())}
      onDone={onDone}
      onSearchChange={setSearch}
      onSelectionChange={setSelected}
      renderItemMeta={(item) => item.startsWith("Workflow") ? <span>자동화</span> : null}
      search={search}
      searchLabel="항목 필터"
      searchPlaceholder="항목 필터"
      selected={selected}
      summaryEmptyLabel="모든 항목"
    />
  );
}

describe("product-owned MultiSelectPicker", () => {
  it("filters the controlled list and toggles only the visible selection", async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness />);

    const search = screen.getByRole("searchbox", { name: "항목 필터" });
    expect(document.activeElement).toBe(search);
    expect((screen.getByRole("checkbox", { name: "Deployment" }) as HTMLInputElement).checked).toBe(true);

    await user.type(search, "workflow");
    expect(screen.getByRole("checkbox", { name: "CronWorkflow" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Workflow자동화" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "WorkflowTemplate자동화" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Deployment" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "표시 3개 선택" }));
    expect(screen.getByText("4개 선택됨")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Workflow자동화" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "WorkflowTemplate자동화" }) as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole("button", { name: "표시 3개 해제" }));
    expect(screen.getByText("1개 선택됨")).toBeTruthy();
  });

  it("keeps clear-all and completion owner-controlled and exposes no-match feedback", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<MultiSelectHarness onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "선택 전체 해제" }));
    expect(screen.getByText("모든 항목")).toBeTruthy();

    await user.type(screen.getByRole("searchbox", { name: "항목 필터" }), "absent");
    expect(screen.getByText("일치 항목 없음")).toBeTruthy();
    expect(screen.getByRole("button", { name: "표시 0개 선택" }).hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("button", { name: "완료" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("keeps an unavailable clear-all action outside the tab order", async () => {
    const user = userEvent.setup();
    render(<MultiSelectHarness clearAllDisabled />);

    const clearAll = screen.getByRole("button", { name: "선택 전체 해제" });
    expect(clearAll.hasAttribute("disabled")).toBe(true);
    await user.click(clearAll);
    expect(screen.getByText("1개 선택됨")).toBeTruthy();
  });

  it("hides an unnecessary filter input and discloses the owner-supplied empty state", () => {
    const { rerender } = render(<MultiSelectHarness itemsOverride={["Pod", "Service"]} />);

    expect(screen.queryByRole("searchbox", { name: "항목 필터" })).toBeNull();

    rerender(<MultiSelectHarness itemsOverride={[]} />);
    expect(screen.getByText("사용 가능한 항목 없음")).toBeTruthy();
  });
});
