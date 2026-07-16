// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge, badgeVariants } from "./badge";

afterEach(cleanup);

describe("product-owned Badge", () => {
  it("keeps warning foreground, surface, and border behind shared semantic tokens", () => {
    render(<Badge variant="warning">관측 지연</Badge>);

    const badge = screen.getByText("관측 지연");
    expect(badge.className).toContain("text-warning-foreground");
    expect(badge.className).toContain("bg-status-warning/10");
    expect(badge.className).toContain("border-status-warning/30");
    expect(badgeVariants({ variant: "warning" })).not.toContain("text-amber");
  });
});

function assertBadgeTypeContracts() {
  // @ts-expect-error resource-kind palettes remain a future typed product projection
  void <Badge kind="Workflow">Workflow</Badge>;
}

void assertBadgeTypeContracts;
