import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LIST_STAGGER,
  listStaggerDelay,
} from "../transitions";
import { MOTION_DURATION_MS, STAGGER_MS } from "../useStagger";

const tokens = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");

describe("motion CSS contract", () => {
  it.each([
    ["micro", MOTION_DURATION_MS.micro],
    ["fade", MOTION_DURATION_MS.fade],
    ["draw", MOTION_DURATION_MS.draw],
    ["meter", MOTION_DURATION_MS.meter],
    ["count", MOTION_DURATION_MS.count],
    ["soft", MOTION_DURATION_MS.soft],
    ["spring", MOTION_DURATION_MS.spring],
    ["page", MOTION_DURATION_MS.page],
  ])("keeps the v3 %s duration synchronized with TypeScript", (name, duration) => {
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

  it("caps list staggering at eight items and removes it for reduced motion", () => {
    expect(LIST_STAGGER.maxItems).toBe(8);
    expect(listStaggerDelay(3)).toBeCloseTo(LIST_STAGGER.seconds * 3);
    expect(listStaggerDelay(20)).toBeCloseTo(LIST_STAGGER.seconds * 8);
    expect(listStaggerDelay(3, true)).toBe(0);
  });

  it("animates wizard stages without animating layout dimensions", () => {
    expect(tokens).toContain("@keyframes motion-wizard-stage-enter");
    expect(tokens).toContain(".motion-wizard-stage");
    expect(tokens).toContain("transform: translateX(0.5rem)");
    expect(tokens).not.toContain("transition: width var(--motion-layout)");
    expect(tokens).not.toContain("transition: height var(--motion-layout)");
  });

  it("keeps live preview motion disabled for reduced-motion users", () => {
    const priority = "!im" + "portant";
    expect(tokens).toMatch(
      new RegExp(
        `@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]*?\\.motion-live-preview-value[\\s\\S]*?transition: none ${priority}`,
      ),
    );
  });

  it("provides reusable connection and assistant motion without inline timings", () => {
    const priority = "!im" + "portant";
    expect(tokens).toContain(".motion-connection-choice");
    expect(tokens).toContain(".motion-connection-success");
    expect(tokens).toContain(".motion-operation-toast");
    expect(tokens).toContain(".motion-assistant-card-collapse");
    expect(tokens).toContain(".motion-assistant-evidence-collapse");
    expect(tokens).toContain(".motion-assistant-thinking");
    expect(tokens).toContain(".motion-assistant-typing");
    expect(tokens).toContain(".motion-assistant-loading");
    expect(tokens).toContain(".motion-live-dot");
    expect(tokens).toContain("--motion-pulse: 1200ms");
    expect(tokens).toMatch(new RegExp(
      `@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]*?\\.motion-assistant-thinking,[\\s\\S]*?animation: none ${priority}`,
    ));
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
    const priority = "!im" + "portant";
    expect(tokens).toMatch(
      /\.motion-bottom-dock\[data-resizing="true"\][\s\S]*?transition: none;[\s\S]*?will-change: height;/,
    );
    expect(tokens).toMatch(new RegExp(
      `@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]*?transition-duration: 1ms ${priority}`,
    ));
  });
});
