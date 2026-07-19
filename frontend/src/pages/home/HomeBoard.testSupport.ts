import { vi } from "vitest";

import type { HomeBoardPorts } from "./useHomeBoardData";

const timelinePolicy = {
  maxBatchEvents: 100,
  maxFramesPerSecond: 30,
  retentionSeconds: 31 * 24 * 60 * 60,
  resume: "cursor" as const,
  hiddenTab: "coalesce" as const,
  reconnect: {
    minDelayMs: 100,
    maxDelayMs: 1_000,
    strategy: "full_jitter_exponential" as const,
  },
  liveSession: {
    maxAgeMs: 30_000,
    strategy: "replace_with_snapshot" as const,
  },
};

export function homeBoardPorts(
  overrides: Partial<HomeBoardPorts> = {},
): HomeBoardPorts {
  return {
    activity: {
      loadOverview: vi.fn().mockResolvedValue({
        fromMs: 0,
        toMs: 60_000,
        bucketMs: 60_000,
        buckets: [{
          fromMs: 0,
          toMs: 60_000,
          deployments: 2,
          alerts: 3,
          critical: 1,
        }],
      }),
    },
    cost: {
      getOverview: vi.fn().mockImplementation(async ({ timeRange }) => {
        const nowSeconds = Math.floor(Date.now() / 1_000);
        return {
          scopeCoverage: {
            availability: "available",
            scopes: [],
            observedAt: new Date().toISOString(),
            reasonCodes: [],
          },
          observation: {
            availability: "available",
            observedAt: new Date().toISOString(),
            currency: "USD",
            dataWindow: timeRange,
            reasonCodes: [],
          },
          summary: {
            availability: "available",
            hourlyCost: 2_000_000,
            monthlyProjection: 1_460_000_000,
            storageCost: null,
            idleCost: null,
            efficiency: null,
            savingsRecommendations: null,
            reasonCodes: [],
          },
          trend: {
            availability: "available",
            timeRange,
            currency: "USD",
            series: [{
              key: "compute",
              label: "Compute",
              points: [
                { timestamp: nowSeconds - 3_600, rateMicros: 1_000_000 },
                { timestamp: nowSeconds, rateMicros: 2_000_000 },
              ],
            }],
            reasonCodes: [],
          },
        };
      }),
    },
    gitops: {
      listApplications: vi.fn().mockResolvedValue([{
        id: "checkout",
        name: "checkout",
        repository: "team/checkout",
        branch: "main",
        clusterId: "cluster-1",
        manifestPath: "deploy",
      }]),
      listSyncTargets: vi.fn().mockResolvedValue([{
        id: "checkout/cluster-1",
        applicationId: "checkout",
        applicationName: "checkout",
        clusterId: "cluster-1",
        namespace: "shop",
        environment: "production",
        syncStatus: "OutOfSync",
        revision: "abc123",
        observedAt: "2026-07-19T01:00:00Z",
      }]),
    },
    inventory: vi.fn().mockResolvedValue({
      cluster_id: "cluster-1",
      latest_snapshot: null,
      counts: [],
      counts_evidence: {
        completeness: "observed",
        observed_at: "2026-07-19T01:00:00Z",
        namespace_scope: [],
        reason_codes: [],
        forbidden: [],
      },
      namespaces: [{
        namespace: "shop",
        total: 12,
        counts: [{ resource_type: "pod", health: "healthy", count: 12 }],
      }],
    }),
    issues: {
      listIssues: vi.fn().mockResolvedValue({
        clusterId: "cluster-1",
        completeness: "exact",
        dataQualityWarnings: [],
        excludedCount: 0,
        items: [{
          id: "issue:cluster-1/incident-1",
          incidentId: "incident-1",
          correlationId: "correlation-1",
          clusterId: "cluster-1",
          namespace: "shop",
          resourceKind: "Pod",
          resourceName: "checkout-api-0",
          symptom: "Restart loop",
          currentSubject: "pod/shop/checkout-api-0",
          status: "investigating",
          severity: "critical",
          severityAvailability: "available",
          rootCause: null,
          confidence: null,
          supportingEvidence: [],
          missingEvidence: [],
          evidenceRef: null,
          actionRoute: null,
          commandId: null,
          pullRequestUrl: null,
          errorReason: null,
          updatedAt: "2026-07-19T01:00:00Z",
        }],
        limit: 3,
        limitReached: false,
        returned: 1,
        total: 1,
        totalMatched: 1,
        filters: { namespaces: [], severities: [], categories: [] },
        visibility: {
          state: "complete",
          completeness: "exact",
          authorizedClusterCount: 1,
          requestedNamespaces: [],
          reasonCodes: [],
        },
        facets: { namespaces: [], severities: [], categories: [] },
        recentChanges: [],
      }),
    },
    resources: {
      listResourcePage: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
        counts: {
          filteredCount: 0,
          unfilteredCount: 0,
          filteredCountCompleteness: "exact",
          unfilteredCountCompleteness: "exact",
        },
        snapshot: {
          snapshotRevision: 1,
          authorizationRevision: "auth-1",
          filterFingerprint: "filter-1",
          observedAt: "2026-07-19T01:00:00Z",
          stale: false,
          partialReasonCodes: [],
        },
        excludedCount: 0,
        dataQualityWarnings: [],
      }),
    },
    timeline: timelineBoardPort(),
    ...overrides,
  };
}

function timelineBoardPort(): HomeBoardPorts["timeline"] {
  const capabilities = {
    selectedSourceMode: "retained" as const,
    availableSourceModes: ["retained" as const],
    maxRetainedRangeMs: 31 * 24 * 60 * 60 * 1_000,
    queryBounds: {
      serverNowMs: Date.now(),
      earliestQueryableMs: Date.now() - 31 * 24 * 60 * 60 * 1_000,
      maxWindowMs: 31 * 24 * 60 * 60 * 1_000,
    },
    namespaceFilterPolicy: "not_required" as const,
    controlSurface: {
      views: [{ id: "list", label: "List", description: null }],
      groupings: [{ id: "flat", label: "None", description: null }],
      sorts: [{ id: "recent", label: "Recent", description: null }],
      activity: [{
        id: "all",
        label: "All",
        description: null,
        activity: [],
        problemsActivity: [],
      }],
      deleted: { key: "include_deleted" as const, label: "Deleted", default: false },
      kinds: {
        key: "kinds" as const,
        label: "Kinds",
        selection: "multi" as const,
        emptySelection: "all" as const,
      },
      timeRanges: [{
        id: "24h",
        label: "24h",
        description: null,
        durationMs: 24 * 60 * 60 * 1_000,
      }],
      defaultTimeRangeId: "24h",
      customTimeRangeId: "custom" as const,
      lensZoomRungs: [{
        id: "1h",
        label: "1h",
        description: null,
        durationMs: 60 * 60 * 1_000,
      }],
      defaultLensZoomRung: "1h",
      legend: {
        key: "legend" as const,
        label: "Legend",
        availability: "available" as const,
        items: [],
      },
      pins: {
        key: "pins" as const,
        label: "Pins",
        availability: "unavailable" as const,
        storage: null,
        revision: null,
        subjectKinds: [] as const,
      },
    },
  };
  return {
    capabilities,
    readCapabilities: vi.fn().mockResolvedValue(capabilities),
    readTimeline: vi.fn().mockImplementation(async (query) => ({
      session: {
        query,
        window: {
          fromMs: Date.now() - 60_000,
          toMs: Date.now(),
        },
        cursor: { token: "cursor-1" },
        policy: timelinePolicy,
      },
      scopes: query.scopes,
      policy: timelinePolicy,
      events: [],
      coverage: [],
      truncated: false,
      eventLimit: null,
      pinSetRevision: null,
    })),
  };
}
