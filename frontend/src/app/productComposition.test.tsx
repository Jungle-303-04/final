import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { createProductComposition } from "./productComposition";
import type { AuthPort } from "../features/auth/authContract";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";
import type { AiAssistantPort } from "../features/ai-assistant/aiAssistantContract";
import type { LogStreamPort } from "../features/log-stream/logStreamContract";
import type { AlertEventsPort } from "../features/alerts/alertEventsContract";

const EmptySurface: ComponentType = () => null;
const testAuthPort: AuthPort = {
  loadSession: async () => ({ status: "unauthenticated" }),
  signIn: async () => { throw new Error("not used"); },
  signOut: async () => undefined,
};
const testClusterScopePort: ClusterScopePort = {
  listClusterChoices: async () => ({ completeness: "unknown", clusters: [] }),
};
const testAiAssistantPort: AiAssistantPort = {
  ask: async () => ({ answer: "no data", evidence: [], action: null }),
  createAlertRule: async () => { throw new Error("not used"); },
  loadSuggestions: async () => [],
  createAlertRule: async () => ({ ruleId: "rule-1" }),
};
const testLogStreamPort: LogStreamPort = { open: () => () => undefined };
const testAlertEventsPort: AlertEventsPort = {
  list: async () => [],
  acknowledge: async () => { throw new Error("not used"); },
  promote: async () => { throw new Error("not used"); },
};

describe("product composition", () => {
  it("keeps the production release closed when no approved surface is registered", () => {
    const composition = createProductComposition([], testAuthPort, testClusterScopePort);

    expect(composition.auth).toBe(testAuthPort);
    expect(composition.clusterScope).toBe(testClusterScopePort);
    expect(composition.surfaces).toEqual([]);
    expect([...composition.releasedSurfaceIds]).toEqual([]);
  });

  it("sorts registered surfaces by the canonical navigation order", () => {
    const composition = createProductComposition([
      { id: "settings", Component: EmptySurface },
      { id: "home", Component: EmptySurface },
      { id: "issues", Component: EmptySurface },
    ], testAuthPort, testClusterScopePort);

    expect(composition.surfaces.map((surface) => surface.id)).toEqual([
      "home",
      "issues",
      "settings",
    ]);
  });

  it("carries the context-bound AI port through the production composition", () => {
    const composition = createProductComposition(
      [],
      testAuthPort,
      testClusterScopePort,
      undefined,
      testAiAssistantPort,
    );

    expect(composition.aiAssistant).toBe(testAiAssistantPort);
  });

  it("carries the log stream transport through the production composition", () => {
    const composition = createProductComposition(
      [],
      testAuthPort,
      testClusterScopePort,
      undefined,
      undefined,
      testLogStreamPort,
    );

    expect(composition.logStream).toBe(testLogStreamPort);
  });

  it("carries the global alert occurrence transport through the production composition", () => {
    const composition = createProductComposition(
      [],
      testAuthPort,
      testClusterScopePort,
      undefined,
      undefined,
      undefined,
      testAlertEventsPort,
    );

    expect(composition.alertEvents).toBe(testAlertEventsPort);
  });

  it("rejects duplicate registrations instead of choosing one implicitly", () => {
    expect(() => createProductComposition([
      { id: "home", Component: EmptySurface },
      { id: "home", Component: EmptySurface },
    ], testAuthPort, testClusterScopePort)).toThrow(/duplicate product surface: home/u);
  });
});
