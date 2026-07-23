import { describe, expect, it } from "vitest";

import { isIncidentNotification, type AlertEventView } from "./alertsFeed";

function alert(
  changes: Partial<AlertEventView> = {},
): AlertEventView {
  return {
    eventId: "ale-inc-1",
    ruleName: "CrashLoopBackOff",
    source: "incident",
    severity: "high",
    status: "firing",
    cluster: "game-server",
    namespace: "sandbox",
    kind: "Pod",
    name: "demo-game-abc",
    firedAt: "2026-07-23T05:00:00Z",
    incidentId: "incident-1",
    ...changes,
  };
}

describe("isIncidentNotification", () => {
  it("notifies for confirmed internal and Alertmanager incidents", () => {
    expect(isIncidentNotification(alert())).toBe(true);
    expect(isIncidentNotification(alert({ source: "alertmanager" }))).toBe(true);
  });

  it("does not notify for rules, resolved events, or unconfirmed alerts", () => {
    expect(isIncidentNotification(alert({ source: "opsia" }))).toBe(false);
    expect(isIncidentNotification(alert({ status: "resolved" }))).toBe(false);
    expect(isIncidentNotification(alert({ incidentId: null }))).toBe(false);
  });
});
