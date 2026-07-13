// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";

afterEach(cleanup);

function ResourceAccordion({ disabled = false }: { disabled?: boolean }) {
  return (
    <Accordion defaultValue={["status"]}>
      <AccordionItem disabled={disabled} value="status">
        <AccordionTrigger>상태</AccordionTrigger>
        <AccordionContent>Running</AccordionContent>
      </AccordionItem>
      <AccordionItem value="metadata">
        <AccordionTrigger>메타데이터</AccordionTrigger>
        <AccordionContent>namespace: management</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

describe("product-owned Accordion", () => {
  it("exposes expanded state and toggles a section with keyboard input", async () => {
    const user = userEvent.setup();
    render(<ResourceAccordion />);

    const status = screen.getByRole("button", { name: "상태" });
    expect(status.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Running")).toBeTruthy();

    status.focus();
    await user.keyboard("{Enter}");
    expect(status.getAttribute("aria-expanded")).toBe("false");

    await user.keyboard("{Enter}");
    expect(status.getAttribute("aria-expanded")).toBe("true");
  });

  it("supports sequential keyboard focus between section triggers", async () => {
    const user = userEvent.setup();
    render(<ResourceAccordion />);

    const status = screen.getByRole("button", { name: "상태" });
    const metadata = screen.getByRole("button", { name: "메타데이터" });
    status.focus();
    await user.tab();
    expect(document.activeElement).toBe(metadata);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(status);
  });

  it("keeps disabled sections unavailable to pointer and keyboard input", async () => {
    const user = userEvent.setup();
    render(<ResourceAccordion disabled />);

    const trigger = screen.getByRole("button", { name: "상태" });
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("supports multiple expanded sections without coupling their state", async () => {
    const user = userEvent.setup();
    render(
      <Accordion defaultValue={["status"]} multiple>
        <AccordionItem value="status">
          <AccordionTrigger>상태</AccordionTrigger>
          <AccordionContent>Running</AccordionContent>
        </AccordionItem>
        <AccordionItem value="events">
          <AccordionTrigger>이벤트</AccordionTrigger>
          <AccordionContent>최근 이벤트</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const status = screen.getByRole("button", { name: "상태" });
    const events = screen.getByRole("button", { name: "이벤트" });
    await user.click(events);
    expect(status.getAttribute("aria-expanded")).toBe("true");
    expect(events.getAttribute("aria-expanded")).toBe("true");
  });

  it("uses canonical slots, semantic tokens, reduced motion, and forced-color focus", () => {
    const { container } = render(<ResourceAccordion />);

    const root = container.querySelector<HTMLElement>('[data-slot="accordion"]');
    const item = container.querySelector<HTMLElement>('[data-slot="accordion-item"]');
    const trigger = screen.getByRole("button", { name: "상태" });
    const content = container.querySelector<HTMLElement>('[data-slot="accordion-content"]');
    const icons = trigger.querySelectorAll('[data-slot="accordion-trigger-icon"]');

    expect(root?.className).toContain("flex");
    expect(item?.className).toContain("forced-colors:border-[CanvasText]");
    expect(trigger.getAttribute("data-slot")).toBe("accordion-trigger");
    expect(trigger.className).toContain("motion-reduce:transition-none");
    expect(trigger.className).toContain("forced-colors:focus-visible:outline-[Highlight]");
    expect(content?.className).toContain("motion-reduce:animate-none");
    expect(icons).toHaveLength(2);
    expect(Array.from(icons).every((icon) => icon.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("preserves canonical slot markers against unsafe runtime props", () => {
    const unsafeRootProps = {
      "data-slot": "replaced-root",
    } as unknown as Parameters<typeof Accordion>[0];
    const unsafeTriggerProps = {
      "data-slot": "replaced-trigger",
    } as unknown as Parameters<typeof AccordionTrigger>[0];

    const { container } = render(
      <Accordion {...unsafeRootProps} defaultValue={["status"]}>
        <AccordionItem value="status">
          <AccordionTrigger {...unsafeTriggerProps}>상태</AccordionTrigger>
          <AccordionContent>Running</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(container.querySelector('[data-slot="accordion"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "상태" }).getAttribute("data-slot")).toBe(
      "accordion-trigger",
    );
  });
});

function assertAccordionTypeContracts() {
  // @ts-expect-error canonical root slot markers are component-owned
  void <Accordion data-slot="other" />;
  // @ts-expect-error canonical item slot markers are component-owned
  void <AccordionItem data-slot="other" value="item" />;
  // @ts-expect-error canonical trigger slot markers are component-owned
  void <AccordionTrigger data-slot="other">제목</AccordionTrigger>;
  // @ts-expect-error canonical content slot markers are component-owned
  void <AccordionContent data-slot="other">내용</AccordionContent>;
}

void assertAccordionTypeContracts;
