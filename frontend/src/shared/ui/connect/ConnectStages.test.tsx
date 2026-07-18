// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectStages, type ConnectStageTriplet } from "./ConnectStages";

const stages: ConnectStageTriplet = [
  { id: "install", label: "에이전트 설치", state: "complete" },
  { id: "handshake", label: "핸드셰이크", state: "active" },
  { id: "sync", label: "동기화", state: "pending" },
];

describe("ConnectStages", () => {
  it("renders the three API-derived stages without owning a timer", () => {
    const { container } = render(
      <ConnectStages ariaLabel="연결 진행" stages={stages} />,
    );

    expect(screen.getByRole("list", { name: "연결 진행" })).toBeTruthy();
    expect(container.querySelectorAll("[data-stage]")).toHaveLength(3);
    expect(container.querySelector("[aria-current='step']")
      ?.getAttribute("data-stage")).toBe("handshake");
  });

  it("marks a server-reported failure as critical", () => {
    const failed: ConnectStageTriplet = [
      stages[0],
      { ...stages[1], state: "error" },
      stages[2],
    ];
    const { container } = render(
      <ConnectStages ariaLabel="연결 진행" stages={failed} />,
    );

    expect(container.querySelector("[data-state='error']")
      ?.textContent).toContain("핸드셰이크");
  });
});
