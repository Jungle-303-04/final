// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

const clusterItems = [
  { label: "kubernetes-ops", value: "kubernetes-ops" },
  { label: "cluster-1", value: "cluster-1" },
] as const;

function ClusterSelect({
  defaultValue = "kubernetes-ops",
  disabled = false,
  onValueChange,
}: {
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string | null) => void;
}) {
  return (
    <Select
      defaultValue={defaultValue}
      disabled={disabled}
      items={clusterItems}
      onValueChange={onValueChange}
    >
      <SelectTrigger aria-label="클러스터 선택">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectLabel>클러스터</SelectLabel>
          {clusterItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

afterEach(cleanup);

describe("product-owned Select", () => {
  it("selects an option, closes the popup, and restores trigger focus", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ClusterSelect onValueChange={onValueChange} />);

    const trigger = screen.getByRole("combobox", { name: "클러스터 선택" });
    expect(trigger.textContent).toContain("kubernetes-ops");

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(await screen.findByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: "cluster-1" })).toBeTruthy();

    await user.click(screen.getByRole("option", { name: "cluster-1" }));

    expect(onValueChange).toHaveBeenCalledWith("cluster-1", expect.anything());
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger.textContent).toContain("cluster-1");
    expect(document.activeElement).toBe(trigger);
  });

  it("supports keyboard navigation and escape without mutating the value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ClusterSelect onValueChange={onValueChange} />);

    const trigger = screen.getByRole("combobox", { name: "클러스터 선택" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeTruthy();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses the option list on an outside pointer without mutating the value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ClusterSelect onValueChange={onValueChange} />);

    const trigger = screen.getByRole("combobox", { name: "클러스터 선택" });
    await user.click(trigger);
    expect(await screen.findByRole("listbox")).toBeTruthy();

    await user.click(document.body);

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger.textContent).toContain("kubernetes-ops");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("keeps disabled controls unavailable to pointer and keyboard input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ClusterSelect disabled onValueChange={onValueChange} />);

    const trigger = screen.getByRole("combobox", { name: "클러스터 선택" });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    await user.click(trigger);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("uses semantic tokens, reduced-motion fallbacks, and owned slot markers", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Select defaultValue="cluster-1" items={clusterItems}>
        <SelectTrigger className="min-w-48" size="sm" aria-label="클러스터 선택">
          <SelectValue className="truncate" />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectLabel>클러스터</SelectLabel>
            <SelectItem value="cluster-1">cluster-1</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectItem disabled value="restricted">
              제한된 클러스터
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "클러스터 선택" });
    expect(trigger.getAttribute("data-slot")).toBe("select-trigger");
    expect(trigger.getAttribute("data-size")).toBe("sm");
    expect(trigger.className).toContain("border-input");
    expect(trigger.className).toContain("bg-background");
    expect(trigger.className).toContain("motion-reduce:transition-none");
    expect(trigger.className).toContain("min-w-48");
    const triggerIcon = trigger.querySelector("svg");
    expect(triggerIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(triggerIcon?.getAttribute("class")).toContain("group-aria-expanded/select-trigger:rotate-180");
    expect(triggerIcon?.getAttribute("class")).toContain("motion-reduce:transition-none");
    expect(container.querySelector('[data-slot="select-value"]')?.className).toContain("truncate");

    await user.click(trigger);

    const content = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-slot="select-content"]');
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });
    expect(content.getAttribute("data-align-trigger")).toBe("false");
    expect(content.className).toContain("bg-popover");
    expect(content.className).toContain("motion-reduce:data-open:animate-none");
    expect(document.querySelector('[data-slot="select-label"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="select-separator"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="select-group"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="select-item"]')).toHaveLength(2);
    expect(
      document
        .querySelector('[data-slot="select-item"][data-disabled]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("preserves canonical slot and size markers against unsafe runtime props", () => {
    const unsafeProps = {
      "data-size": "default",
      "data-slot": "not-a-select-trigger",
    } as unknown as Parameters<typeof SelectTrigger>[0];

    render(
      <Select defaultValue="cluster-1" items={clusterItems}>
        <SelectTrigger {...unsafeProps} aria-label="클러스터 선택" size="sm">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "클러스터 선택" });
    expect(trigger.getAttribute("data-slot")).toBe("select-trigger");
    expect(trigger.getAttribute("data-size")).toBe("sm");
  });
});

function assertSelectTypeContracts() {
  // @ts-expect-error Select supports only canonical default and small trigger sizes
  void <SelectTrigger size="large">잘못된 크기</SelectTrigger>;
  // @ts-expect-error canonical slot markers are component-owned
  void <SelectTrigger data-slot="other">잘못된 슬롯</SelectTrigger>;
  // @ts-expect-error canonical size markers are derived from the size prop
  void <SelectTrigger data-size="sm">잘못된 크기 속성</SelectTrigger>;
  // @ts-expect-error select part slot markers are component-owned
  void <SelectItem data-slot="other" value="cluster-1">잘못된 항목 슬롯</SelectItem>;
}

void assertSelectTypeContracts;
