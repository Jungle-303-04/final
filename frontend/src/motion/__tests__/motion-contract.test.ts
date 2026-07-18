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

  it("animates wizard stages without animating layout dimensions", () => {
    expect(tokens).toContain("@keyframes motion-wizard-stage-enter");
    expect(tokens).toContain(".motion-wizard-stage");
    expect(tokens).toContain("transform: translateX(0.5rem)");
    expect(tokens).not.toContain("transition: width var(--motion-layout)");
    expect(tokens).not.toContain("transition: height var(--motion-layout)");
  });

  it("enters detail workspaces from the logical end edge and reverses for RTL", () => {
    expect(tokens).toContain("transform: translateX(var(--motion-detail-inline-offset, 3rem))");
    expect(tokens).toMatch(
      /:where\(\[dir="rtl"\]\) \.motion-detail-workspace \{[\s\S]*?--motion-detail-inline-offset: -3rem;/,
    );
    expect(tokens).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.motion-detail-workspace[\s\S]*?animation: none !important/,
    );
  });

  it("keeps live preview motion disabled for reduced-motion users", () => {
    expect(tokens).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.motion-live-preview-value[\s\S]*?transition: none !important/,
    );
  });

  it("uses a short topology overlay entrance and removes it for reduced-motion users", () => {
    const priority = "!im" + "portant";
    expect(tokens).toContain("@keyframes motion-topology-overlay-enter");
    expect(tokens).toMatch(
      /\.motion-topology-overlay \{[\s\S]*?var\(--motion-quick\)[\s\S]*?var\(--ease-out\)/,
    );
    expect(tokens).toMatch(new RegExp(
      `@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]*?\\.motion-topology-overlay,[\\s\\S]*?animation: none ${priority}`,
    ));
  });

  it("keeps diagnose stream feedback transform-only and reduced-motion safe", () => {
    const priority = "!im" + "portant";
    expect(tokens).toContain("@keyframes motion-diagnose-entry");
    expect(tokens).toContain("@keyframes motion-diagnose-thinking");
    expect(tokens).toContain("@keyframes motion-diagnose-verdict");
    expect(tokens).toMatch(
      /\.motion-diagnose-entry \{[\s\S]*?var\(--motion-quick\)[\s\S]*?var\(--ease-out\)/,
    );
    expect(tokens).toMatch(new RegExp(
      `@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]*?\\.motion-diagnose-entry,[\\s\\S]*?animation: none ${priority}`,
    ));
    expect(tokens).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.motion-diagnose-thinking[\s\S]*?background: none;/,
    );
  });

  it("removes dock height interpolation during direct resizing and for reduced-motion users", () => {
    expect(tokens).toMatch(
      /\.motion-bottom-dock\[data-resizing="true"\][\s\S]*?transition: none;[\s\S]*?will-change: height;/,
    );
    expect(tokens).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration: 1ms !important/,
    );
  });
});
