// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AnimatedPercentageValue,
  NodeCard,
  NodePodSlotGrid,
  NodeSkeleton,
  nodeCardColumnSpan,
} from "./devpreview-opsia";
import type { InvNode, InvPod } from "./devpreview/inventoryTopologyFeed";

describe("NodeCard observed health details", () => {
  it("renders separate icon-backed problem counts and keeps the whole card clickable", async () => {
    const onOpen = vi.fn();
    render(
      <NodeCard
        node={{
          name: "worker-warning",
          status: "not_ready",
          health: "warning",
          cluster: "game-server-live",
          key: "worker-warning-id",
          cpuPercent: 71.2,
          memoryPercent: 63.4,
          matchedPodCount: 7,
          totalPodCount: 29,
          restartsRecent: 2,
          conditions: ["DiskPressure"],
        }}
        pods={[
          {
            name: "broken-pod", namespace: "game", status: "CrashLoopBackOff", health: "critical",
            cluster: "game-server-live", key: "pod-broken", serverId: "worker-warning-id",
            cpuMillicores: null, memoryMebibytes: null, restartCount: 4,
          },
          {
            name: "pending-pod", namespace: "game", status: "Pending", health: "unknown",
            cluster: "game-server-live", key: "pod-pending", serverId: "worker-warning-id",
            cpuMillicores: null, memoryMebibytes: null, restartCount: 0,
          },
        ]}
        problemPodCount={1}
        onOpen={onOpen}
        onTip={() => undefined}
      />,
    );

    expect(screen.getByLabelText("문제 파드 1").textContent).toContain("1문제 파드");
    expect(screen.getByLabelText("최근 재시작 2").textContent).toContain("2최근 재시작");
    expect(screen.getByLabelText("문제 조건 1").textContent).toContain("1조건");
    expect(screen.queryByText(/⚠/u)).toBeNull();
    await waitFor(() => {
      expect(screen.getByText("71.2%")).toBeTruthy();
      expect(screen.getByText("63.4%")).toBeTruthy();
    });
    const slots = screen.getByRole("img", { name: "파드 슬롯 7/29" });
    expect(slots.querySelectorAll("[data-slot-state]")).toHaveLength(29);
    expect(slots.getAttribute("data-slot-columns")).toBe("15");
    expect(slots.getAttribute("data-visible-slot-count")).toBe("29");
    expect(slots.getAttribute("data-hidden-slot-count")).toBe("0");
    expect(slots.querySelectorAll('[data-slot-state="critical"]')).toHaveLength(1);
    expect(slots.querySelectorAll('[data-slot-state="pending"]')).toHaveLength(1);
    expect(slots.querySelectorAll('[data-slot-state="occupied"]')).toHaveLength(5);
    expect(slots.querySelectorAll('[data-slot-state="empty"]')).toHaveLength(22);

    fireEvent.click(screen.getByRole("button", { name: /worker-warning/u }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("NodeCard metric interpolation", () => {
  it("paints the first real sample directly, then interpolates from the previous sample at at most 60fps", () => {
    let now = 100;
    let nextFrame = 1;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return nextFrame++;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const rendered = render(<AnimatedPercentageValue reducedMotion={false} value={20} />);
    expect(rendered.container.textContent).toBe("20%");
    expect(frames).toHaveLength(0);

    rendered.rerender(<AnimatedPercentageValue reducedMotion={false} value={80} />);
    expect(rendered.container.textContent).toBe("20%");
    expect(frames).toHaveLength(1);

    act(() => {
      now = 240;
      frames.shift()?.(now);
    });
    const intermediate = Number.parseFloat(rendered.container.textContent ?? "NaN");
    expect(intermediate).toBeGreaterThan(20);
    expect(intermediate).toBeLessThan(80);

    act(() => {
      // A 120 Hz callback arrives inside the 60 Hz paint budget and is skipped.
      now = 248;
      frames.shift()?.(now);
    });
    expect(Number.parseFloat(rendered.container.textContent ?? "NaN")).toBe(intermediate);

    act(() => {
      now = 380;
      frames.shift()?.(now);
    });
    expect(rendered.container.textContent).toBe("80%");
  });
});

describe("NodeCard four-unit slot geometry", () => {
  const node = (capacity: number, occupied = capacity): InvNode => ({
    name: `worker-${capacity}`,
    status: "ready",
    health: "healthy",
    cluster: "game-server-live",
    key: `worker-${capacity}`,
    cpuPercent: 20,
    memoryPercent: 30,
    matchedPodCount: occupied,
    totalPodCount: capacity,
  });

  it.each([
    [10, 1],
    [11, 2],
    [20, 2],
    [21, 3],
    [30, 3],
    [31, 4],
    [40, 4],
    [58, 4],
  ] as const)("maps capacity %i to a %i/4 card span", (capacity, span) => {
    expect(nodeCardColumnSpan(node(capacity))).toBe(span);
  });

  it.each([
    [10, 5, 10],
    [20, 10, 20],
    [30, 15, 30],
    [40, 20, 40],
  ] as const)("renders %i slots as exactly two rows of %i columns", (capacity, columns, visible) => {
    const { unmount } = render(<NodePodSlotGrid node={node(capacity)} pods={[]} />);
    const slots = screen.getByRole("img", { name: `파드 슬롯 ${capacity}/${capacity}` });

    expect(slots.getAttribute("data-slot-columns")).toBe(String(columns));
    expect(slots.getAttribute("data-visible-slot-count")).toBe(String(visible));
    expect(slots.querySelectorAll("[data-slot-state]")).toHaveLength(visible);
    unmount();
  });

  it("caps a large node at forty DOM slots and exposes the omitted count", () => {
    const problemPods: InvPod[] = [
      {
        name: "critical", namespace: "game", status: "CrashLoopBackOff", health: "critical",
        cluster: "game-server-live", key: "critical", serverId: "worker-58",
        cpuMillicores: null, memoryMebibytes: null, restartCount: 3,
      },
      {
        name: "pending", namespace: "game", status: "Pending", health: "unknown",
        cluster: "game-server-live", key: "pending", serverId: "worker-58",
        cpuMillicores: null, memoryMebibytes: null, restartCount: 0,
      },
    ];
    render(<NodePodSlotGrid node={node(58, 45)} pods={problemPods} />);

    const slots = screen.getByRole("img", { name: "파드 슬롯 45/58, 40개 표시, 18개 더 있음" });
    expect(slots.getAttribute("data-slot-columns")).toBe("20");
    expect(slots.getAttribute("data-visible-slot-count")).toBe("40");
    expect(slots.getAttribute("data-hidden-slot-count")).toBe("18");
    expect(slots.querySelectorAll("[data-slot-state]")).toHaveLength(40);
    expect(slots.querySelectorAll('[data-slot-state="critical"]')).toHaveLength(1);
    expect(slots.querySelectorAll('[data-slot-state="pending"]')).toHaveLength(1);
    expect(slots.querySelectorAll('[data-slot-state="occupied"]')).toHaveLength(38);
    expect(slots.querySelector("[data-slot-overflow='18']")?.textContent).toBe("+18");
  });
});

describe("NodeCard cold-start geometry", () => {
  it("reserves one stable four-column row with square one-unit shells", () => {
    render(<NodeSkeleton />);

    const grid = screen.getByTestId("node-skeleton-grid");
    expect(grid.getAttribute("data-grid-columns")).toBe("4");
    const cards = grid.querySelectorAll('[data-node-skeleton-card="unit"]');
    expect(cards).toHaveLength(4);
    cards.forEach((card) => {
      expect(card.getAttribute("data-node-card-span")).toBe("1");
      expect(card.querySelector('[data-node-skeleton-slots="10"]')?.children).toHaveLength(10);
    });
  });
});
