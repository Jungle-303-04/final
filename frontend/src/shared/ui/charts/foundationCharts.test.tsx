// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MiniBar, MiniBars, ProgressFill, RatioBar } from "./Bars";
import { SlotMatrix } from "./Lists";
import { Donut, RingGauge } from "./Radial";

describe("foundation chart primitives", () => {
  it("keeps unavailable different from a real zero", () => {
    const { rerender } = render(
      <MiniBar ariaLabel="CPU 사용할 수 없음" value={null} />,
    );
    const unavailable = screen.getByRole("img", { name: "CPU 사용할 수 없음" });
    expect(unavailable.getAttribute("data-state")).toBe("unavailable");
    expect(unavailable.querySelector(".recharts-reference-line-line")
      ?.getAttribute("stroke-dasharray")).toBe("2 3");

    rerender(<MiniBar ariaLabel="CPU 0%" value={0} />);
    const measured = screen.getByRole("img", { name: "CPU 0%" });
    expect(measured.getAttribute("data-state")).toBe("measured");
    expect(measured.querySelector(".recharts-reference-line-line")).toBeNull();
    expect(measured.querySelector(".recharts-bar")).toBeTruthy();
  });

  it("maps caller-provided ratio segments to a Recharts stack", () => {
    const { container } = render(
      <RatioBar
        ariaLabel="상태 비율"
        segments={[
          { id: "ok", tone: "healthy", value: 3 },
          { id: "crit", tone: "critical", value: 1 },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "상태 비율" })
      .getAttribute("data-state")).toBe("measured");
    expect(container.querySelectorAll(".recharts-bar")).toHaveLength(2);
    const chartStyle = container.querySelector("[data-slot='chart'] > style");
    expect(chartStyle?.textContent).toContain(
      "--color-segment0: var(--color-status-healthy)",
    );
    expect(chartStyle?.textContent).toContain(
      "--color-segment1: var(--color-status-critical)",
    );
  });

  it("renders compact series with unavailable cells through Recharts", () => {
    const { container } = render(
      <MiniBars ariaLabel="최근 CPU" values={[10, null, 30]} />,
    );
    expect(screen.getByRole("img", { name: "최근 CPU" })
      .getAttribute("data-state")).toBe("partial");
    expect(container.querySelector(".recharts-bar")).toBeTruthy();
    expect(container.querySelectorAll(".recharts-rectangle")).toHaveLength(3);
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
    expect(container.querySelector(".recharts-wrapper")).toBeTruthy();
  });

  it("keeps unknown ring data distinct in the Recharts implementation", () => {
    const { container } = render(
      <RingGauge
        ariaLabel="CPU 사용할 수 없음"
        displayValue="—"
        surface="detail-overview"
        value={null}
      />,
    );

    expect(
      screen
        .getByRole("img", { name: "CPU 사용할 수 없음" })
        .getAttribute("data-chart-state"),
    ).toBe("unknown");
    expect(container.querySelector(".recharts-wrapper")).toBeTruthy();
    expect(container.textContent).toContain("—");
  });

  it("exposes radial and progress visuals by their supplied labels", () => {
    const { rerender } = render(
      <>
        <Donut
          ariaLabel="네임스페이스 분포"
          segments={[{ id: "a", tone: "primary", value: 1 }]}
        />
        <ProgressFill ariaLabel="연결 50%" value={50} />
      </>,
    );
    expect(screen.getByRole("img", { name: "네임스페이스 분포" })).toBeTruthy();
    const progress = screen.getByRole("progressbar", { name: "연결 50%" });
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
    expect(progress.querySelector("svg")).toBeNull();
    expect((progress.querySelector("[data-slot='progress-indicator']") as HTMLElement | null)
      ?.style.width).toBe("50%");

    rerender(<ProgressFill ariaLabel="연결 상태 없음" value={null} />);
    const unavailable = screen.getByRole("progressbar", { name: "연결 상태 없음" });
    expect(unavailable.hasAttribute("aria-valuenow")).toBe(false);
    expect(unavailable.querySelector("[data-slot='progress-unavailable']"))
      .toBeTruthy();
  });

  it("injects token colors into the shared chart container", () => {
    const { container } = render(
      <Donut
        ariaLabel="워크로드 분포"
        centerLabel="4"
        segments={[
          { id: "healthy", tone: "healthy", value: 3 },
          { id: "critical", tone: "critical", value: 1 },
        ]}
      />,
    );

    const chartStyle = container.querySelector("[data-slot='chart'] > style");
    expect(chartStyle?.textContent).toContain(
      "--color-tone-healthy: var(--color-status-healthy)",
    );
    expect(chartStyle?.textContent).toContain(
      "--color-tone-critical: var(--color-status-critical)",
    );
    expect(container.textContent).toContain("4");
  });
});
