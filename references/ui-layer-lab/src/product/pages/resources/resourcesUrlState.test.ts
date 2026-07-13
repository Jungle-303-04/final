import { describe, expect, it } from "vitest";
import {
  decodeResourceSelection,
  encodeResourceSelection,
} from "./resourcesUrlState";

describe("Resources URL identity", () => {
  it("round-trips backend-valid event names containing colons", () => {
    const identity = {
      resourceType: "event",
      kind: "Event",
      namespace: "shop",
      name: "uid-1:Pod:checkout-api-0:BackOff",
    } as const;

    const selection = encodeResourceSelection(identity);

    expect(selection).toEqual({
      kind: "Event",
      resource: "shop/uid-1:Pod:checkout-api-0:BackOff",
    });
    expect(decodeResourceSelection("event", selection.kind, selection.resource))
      .toEqual(identity);
  });

  it("accepts provider-neutral catalog types and kinds within backend length bounds", () => {
    const identity = {
      resourceType: "custom.io:widget",
      kind: "Custom-Widget",
      namespace: null,
      name: "widget:blue",
    } as const;

    const selection = encodeResourceSelection(identity);

    expect(decodeResourceSelection(identity.resourceType, selection.kind, selection.resource))
      .toEqual(identity);
  });

  it("rejects ambiguous composite identities instead of throwing during decode", () => {
    expect(decodeResourceSelection("event", "Event", "shop/one/two")).toBeNull();
    expect(() => encodeResourceSelection({
      resourceType: "event",
      kind: "Event",
      namespace: "shop",
      name: "one/two",
    })).toThrowError(TypeError);
  });
});
