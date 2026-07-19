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

  it("round-trips an explicit Resources topology pin through the shared view key", () => {
    const parsed = parseProductFilterUrl("?clusters=cluster-1&view=relations");

    expect(parsed.detail.resourceTopologyView).toBe("relations");
    expect(parsed.detail.workflowView).toBeUndefined();
    expect(serializeProductFilterUrl(parsed.state, parsed.detail))
      .toBe("?clusters=cluster-1&view=relations");
  });

  it.each(["map", "list", "flow"] as const)(
    "round-trips the canonical Resources surface view %s",
    (view) => {
      const parsed = parseProductFilterUrl(`?view=${view}`);

      expect(parsed.detail.resourceSurfaceView).toBe(view);
      expect(serializeProductFilterUrl(parsed.state, parsed.detail)).toBe(`?view=${view}`);
    },
  );
});
