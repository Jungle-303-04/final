import { describe, expect, it } from "vitest";
import { AuthPortFailure, type AuthFailureCode } from "./authContract";
import { logoutIssue, toAuthActionIssue } from "./authIssues";

describe("structured authentication issues", () => {
  it.each([
    ["invalid-credentials", "auth.login.error.invalidCredentials"],
    ["email-unverified", "auth.login.error.emailUnverified"],
    ["approval-pending", "auth.login.error.approvalPending"],
    ["forbidden", "auth.failure.forbidden"],
    ["network", "auth.failure.network"],
    ["invalid-response", "auth.failure.invalidResponse"],
    ["server", "auth.failure.server"],
  ] as const)("maps %s to the canonical catalog key", (code, messageKey) => {
    expect(toAuthActionIssue(new AuthPortFailure(code))).toMatchObject({
      code,
      messageKey,
      retryAfterSeconds: null,
    });
  });

  it("keeps rate-limit interpolation typed instead of pre-rendering a locale", () => {
    expect(toAuthActionIssue(new AuthPortFailure("rate-limited", 12))).toMatchObject({
      code: "rate-limited",
      messageKey: "auth.failure.rateLimitedAfter",
      messageParams: { seconds: 12 },
      retryAfterSeconds: 12,
    });
    expect(toAuthActionIssue(new AuthPortFailure("rate-limited"))).toMatchObject({
      code: "rate-limited",
      messageKey: "auth.failure.rateLimited",
      retryAfterSeconds: null,
    });
  });

  it("preserves only the adapter-approved plain fallback detail", () => {
    const issue = toAuthActionIssue(new AuthPortFailure(
      "server",
      null,
      "Authentication is temporarily unavailable.",
    ));

    expect(issue).toMatchObject({
      messageKey: "auth.failure.server",
      safeDetail: "Authentication is temporarily unavailable.",
    });
  });

  it("uses a logout-specific recovery message without leaking raw errors", () => {
    const raw = new Error("private backend detail and stack");
    const issue = logoutIssue(raw);

    expect(issue).toMatchObject({
      code: "server" satisfies AuthFailureCode,
      messageKey: "auth.logout.error.message",
    });
    expect(issue.safeDetail).toBeUndefined();
    expect(JSON.stringify(issue)).not.toContain("private backend detail");
  });
});
