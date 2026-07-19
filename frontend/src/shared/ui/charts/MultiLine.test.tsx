// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MultiLine } from "./MultiLine";

describe("MultiLine", () => {
  it("exposes server bucket values through keyboard crosshair navigation", () => {
    render(
      <MultiLine
        ariaLabel="활동 추이"
        formatPoint={(index) => `bucket-${index}`}
        labels={["a", "b"]}
        series={[
          { id: "deploy", label: "배포", tone: "primary", values: [0, 2] },
          { id: "critical", label: "임계", tone: "critical", values: [1, 0] },
        ]}
      />,
    );

    const chart = screen.getByRole("img", { name: "활동 추이" });
    fireEvent.focus(chart);
    expect(screen.getByText("bucket-1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();

    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByText("bucket-0")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });
});
