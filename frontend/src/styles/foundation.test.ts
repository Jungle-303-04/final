import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const foundation = readFileSync(new URL("./foundation.css", import.meta.url), "utf8");

describe("global scrollbar geometry", () => {
  it("reserves stable space and keeps native tracks transparent", () => {
    expect(foundation).toContain("scrollbar-gutter: stable");
    expect(foundation).toMatch(/\*::-webkit-scrollbar-track,[\s\S]*?background:\s*transparent/u);
    expect(foundation).toContain("scrollbar-color: color-mix");
  });

  it("retains an operating-system scrollbar contrast in forced colors", () => {
    expect(foundation).toMatch(
      /@media \(forced-colors: active\)[\s\S]*?scrollbar-color:\s*ButtonText Canvas/u,
    );
  });
});
