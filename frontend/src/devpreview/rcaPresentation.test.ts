import { describe, expect, it } from "vitest";

import { missingEvidenceAction } from "./rcaPresentation";

describe("missingEvidenceAction", () => {
  it("humanizes probe port signals without exposing internal tokens", () => {
    const label = missingEvidenceAction("signal:probe_port_failure_signal");

    expect(label).toBe(
      "애플리케이션의 실제 수신 포트와 readiness probe 포트가 일치하는지 확인하세요.",
    );
    expect(label).not.toContain("signal:");
    expect(label).not.toContain("probe_port_failure");
  });

  it("keeps unknown signal identifiers out of the operator UI", () => {
    const label = missingEvidenceAction("signal:new_internal_check");

    expect(label).toBe("원인 확정에 필요한 추가 진단 신호를 수집해 확인하세요.");
    expect(label).not.toContain("new_internal_check");
  });
});
