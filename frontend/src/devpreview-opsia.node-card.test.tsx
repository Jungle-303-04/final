// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeCard } from "./devpreview-opsia";

describe("NodeCard observed health details", () => {
  it("renders separate icon-backed problem counts and keeps the whole card clickable", () => {
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
    expect(screen.getByText("71.2%")).toBeTruthy();
    expect(screen.getByText("63.4%")).toBeTruthy();
    const slots = screen.getByRole("img", { name: "파드 슬롯 7/29" });
    expect(slots.querySelectorAll("[data-slot-state]")).toHaveLength(29);
    expect(slots.querySelectorAll('[data-slot-state="critical"]')).toHaveLength(1);
    expect(slots.querySelectorAll('[data-slot-state="pending"]')).toHaveLength(1);
    expect(slots.querySelectorAll('[data-slot-state="occupied"]')).toHaveLength(5);
    expect(slots.querySelectorAll('[data-slot-state="empty"]')).toHaveLength(22);

    fireEvent.click(screen.getByRole("button", { name: /worker-warning/u }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
