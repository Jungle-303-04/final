import { describe, expect, it } from "vitest";
import { abbreviatedIdentity, presentProductSession } from "./sessionPresentation";

describe("session presentation", () => {
  it("uses display name, then email, then an abbreviated identifier", () => {
    expect(presentProductSession({
      displayName: "Woo Nyong",
      email: "woonyong.kr@gmail.com",
      roles: ["service_admin"],
      userId: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
      workspaceId: "default",
    })).toMatchObject({
      avatarLabel: "WN",
      displayName: "Woo Nyong",
      fullIdentity: "Woo Nyong",
      secondaryLabel: "woonyong.kr@gmail.com",
    });

    expect(presentProductSession({
      email: "woonyong.kr@gmail.com",
      roles: ["service_admin"],
      userId: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
      workspaceId: "default",
    }).displayName).toBe("woonyong.kr@gmail.com");

    expect(presentProductSession({
      roles: ["service_admin"],
      userId: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
      workspaceId: "default",
    })).toMatchObject({
      displayName: "user-bf4…",
      fullIdentity: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
      secondaryLabel: "service_admin",
    });
  });

  it("does not add an ellipsis to short identifiers", () => {
    expect(abbreviatedIdentity("admin")).toBe("admin");
  });
});
