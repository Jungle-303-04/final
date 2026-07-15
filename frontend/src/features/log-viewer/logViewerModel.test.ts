import { describe, expect, it } from "vitest";

import type { BottomDockLine } from "../bottom-dock/bottomDockState";
import {
  createLogSearch,
  detectLogLevel,
  parseStructuredLog,
} from "./logViewerModel";

describe("log viewer model", () => {
  it("classifies textual and structured levels without coloring unknown lines", () => {
    expect(detectLogLevel("ERROR checkout failed")).toBe("error");
    expect(detectLogLevel('{"level":40,"message":"slow"}')).toBe("warn");
    expect(detectLogLevel("severity=debug service=api message=ready")).toBe("debug");
    expect(detectLogLevel("request complete in 12ms")).toBe("unknown");
  });

  it("parses JSON and credible logfmt while leaving prose raw", () => {
    expect(parseStructuredLog('{"level":"info","request_id":"r-1"}')).toEqual({
      format: "json",
      fields: { level: "info", request_id: "r-1" },
    });
    expect(parseStructuredLog('level=info service=api message="request complete"')).toEqual({
      format: "logfmt",
      fields: { level: "info", service: "api", message: "request complete" },
    });
    expect(parseStructuredLog("one=value sentence remains human prose").format).toBe("raw");
  });

  it("searches metadata and text with literal, case-sensitive, and safe regex modes", () => {
    const value = line("Payment FAILED", "checkout-api");
    expect(createLogSearch("payment", false, false).matches(value)).toBe(true);
    expect(createLogSearch("payment", false, true).matches(value)).toBe(false);
    expect(createLogSearch("checkout-(api|worker)", true, false).matches(value)).toBe(true);
    const invalid = createLogSearch("[", true, false);
    expect(invalid.matches(value)).toBe(false);
    expect(invalid.error).not.toBeNull();
  });
});

function line(value: string, pod = "checkout"): BottomDockLine {
  return {
    id: "line-1",
    observedAt: "2026-07-14T08:00:00+00:00",
    pod,
    container: "app",
    line: value,
    lineTruncated: false,
  };
}
