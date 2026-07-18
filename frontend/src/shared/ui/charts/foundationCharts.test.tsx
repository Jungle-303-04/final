// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MiniBar, ProgressFill, RatioBar } from "./Bars";
import { SlotMatrix } from "./Lists";
import { Donut, RingGauge } from "./Radial";

describe("foundation chart primitives", () => {
  it("keeps unavailable different from a real zero", () => {
    const { container, rerender } = render(
      <MiniBar ariaLabel="CPU 사용할 수 없음" value={null} />,
    );
    expect(container.querySelector("path[stroke-dasharray]")).toBeTruthy();

    rerender(<MiniBar ariaLabel="CPU 0%" value={0} />);
    expect(container.querySelector("rect[width='0']")).toBeTruthy();
    expect(container.querySelector("path[stroke-dasharray]")).toBeNull();
  });

  it("derives ratio geometry only from caller-provided values", () => {
    const { container } = render(
      <RatioBar
        ariaLabel="상태 비율"
        segments={[
          { id: "ok", tone: "healthy", value: 3 },
          { id: "crit", tone: "critical", value: 1 },
        ]}
      />,
    );
    const widths = [...container.querySelectorAll("rect")]
      .slice(1)
      .map((rect) => rect.getAttribute("width"));
    expect(widths).toEqual(["75", "25"]);
  });

  it("caps slot DOM density while retaining the full accessible summary", () => {
    const { container } = render(
      <SlotMatrix ariaLabel="76개 중 38개 사용" filled={38} total={76} />,
    );
    expect(screen.getByRole("img", { name: "76개 중 38개 사용" })).toBeTruthy();
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(40);
  });

  it("restricts the ring gauge to detail overview usage", () => {
    const { container } = render(
      <RingGauge
        ariaLabel="CPU 사용률"
        displayValue="42%"
        surface="detail-overview"
        value={42}
      />,
    );
    expect(container.querySelector("[data-surface='detail-overview']")).toBeTruthy();
  });

  it("exposes radial and progress visuals by their supplied labels", () => {
    render(
      <>
        <Donut
          ariaLabel="네임스페이스 분포"
          segments={[{ id: "a", tone: "primary", value: 1 }]}
        />
        <ProgressFill ariaLabel="연결 50%" value={50} />
      </>,
    );
    expect(screen.getByRole("img", { name: "네임스페이스 분포" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "연결 50%" })).toBeTruthy();
  });
});
