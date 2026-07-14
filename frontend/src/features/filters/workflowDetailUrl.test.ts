import { describe, expect, it } from "vitest";
import { parseProductFilterUrl, serializeProductFilterUrl } from "./filterUrl";

describe("workflow detail URL state", () => {
  it("round-trips the selected plan, workspace view, and creation mode", () => {
    const parsed = parseProductFilterUrl("?plan=plan-a&view=edit&mode=new");

    expect(parsed.detail).toMatchObject({
      workflowPlan: "plan-a",
      workflowView: "edit",
      workflowMode: "new",
    });
    expect(serializeProductFilterUrl(parsed.state, parsed.detail))
      .toBe("?plan=plan-a&view=edit&mode=new");
  });

  it("drops unsupported workspace values during canonicalization", () => {
    const parsed = parseProductFilterUrl("?plan=plan-a&view=unknown&mode=unsafe");

    expect(parsed.detail.workflowPlan).toBe("plan-a");
    expect(parsed.detail.workflowView).toBeUndefined();
    expect(parsed.detail.workflowMode).toBeUndefined();
    expect(parsed.needsCanonicalWrite).toBe(true);
    expect(serializeProductFilterUrl(parsed.state, parsed.detail)).toBe("?plan=plan-a");
  });
});
