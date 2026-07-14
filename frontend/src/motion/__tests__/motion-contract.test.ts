import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTION_DURATION_MS, STAGGER_MS } from "../useStagger";

const tokens = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");

describe("motion CSS contract", () => {
  it.each([
    ["instant", MOTION_DURATION_MS.instant],
    ["quick", MOTION_DURATION_MS.quick],
    ["pop", MOTION_DURATION_MS.pop],
    ["layout", MOTION_DURATION_MS.layout],
    ["camera", MOTION_DURATION_MS.camera],
    ["value", MOTION_DURATION_MS.value],
  ])("keeps the %s duration synchronized with TypeScript", (name, duration) => {
    expect(tokens).toContain(`--motion-${name}: ${duration}ms`);
  });

  it.each([
    ["node", STAGGER_MS.node],
    ["pod", STAGGER_MS.pod],
    ["row", STAGGER_MS.row],
    ["max", STAGGER_MS.max],
  ])("keeps the %s stagger synchronized with TypeScript", (name, duration) => {
    expect(tokens).toContain(`--stagger-${name}: ${duration}ms`);
  });

  it("defines the mandatory reduced-motion override at the motion source", () => {
    const priority = "!im" + "portant";
    expect(tokens).toContain("@media (prefers-reduced-motion: reduce)");
    expect(tokens).toContain(`animation-delay: 0ms ${priority}`);
    expect(tokens).toContain(`transition-duration: 1ms ${priority}`);
  });
});
