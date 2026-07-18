import { describe, expect, it } from "vitest";
import {
  COMMON_FILTER_AXIS_OPERATORS,
  createEmptyUnifiedFilterState,
  type UnifiedFilterState,
} from "./filterContract";
import {
  canonicalizeProductFilterUrl,
  parseProductFilterUrl,
  productFilterNavigationHref,
  serializeProductFilterUrl,
} from "./filterUrl";
describe("VP-010 unified filter URL", () => {
  it("round-trips every common and surface axis in canonical order", () => {
    const state: UnifiedFilterState = {
      common: {
        clusters: ["cluster-b", "cluster-a", "cluster-b"],
        namespaces: [
          { clusterId: "unknown/cluster", namespace: "platform" },
          { clusterId: "cluster-a", namespace: "shop" },
        ],
        applications: ["app-b", "app-a"],
        labels: [
          { key: "tier", value: "critical" },
          { key: "team", value: "checkout" },
          { key: "app.kubernetes.io/name", value: "checkout" },
        ],
      },
      resources: {
        types: ["Pod", "Deployment"],
        health: ["healthy", "degraded"],
        includeDeleted: true,
        query: "checkout api",
        view: "graph",
      },
      issues: {
        severity: ["warning", "critical"],
        category: ["scheduling", "container_restart"],
        status: ["open"],
        environment: ["prod"],
        query: "payments",
      },
      applicationSurface: {
        environment: ["prod"],
        status: ["degraded"],
        pendingPromotion: true,
        query: "checkout",
      },
      gitops: {
        environment: ["prod"],
        approval: ["pending"],
        changeType: ["image"],
        query: "release",
      },
      checks: {
        severity: ["critical"],
        category: ["security"],
        query: "policy",
      },
    };

    const search = serializeProductFilterUrl(state);

    expect(search).toBe(
      "?clusters=cluster-a,cluster-b" +
      "&namespaces=cluster-a%2Fshop,unknown%2Fcluster%2Fplatform" +
      "&applications=app-a,app-b" +
      "&labels=app.kubernetes.io%2Fname%3Dcheckout,team%3Dcheckout,tier%3Dcritical" +
      "&resources.types=Deployment,Pod" +
      "&resources.health=degraded,healthy" +
      "&resources.includeDeleted=true" +
      "&resources.q=checkout%20api" +
      "&resources.view=graph" +
      "&issues.severity=critical,warning" +
      "&issues.category=container_restart,scheduling" +
      "&issues.status=open" +
      "&issues.environment=prod" +
      "&issues.q=payments" +
      "&applications.environment=prod" +
      "&applications.status=degraded" +
      "&applications.pendingPromotion=true" +
      "&applications.q=checkout" +
      "&gitops.environment=prod" +
      "&gitops.approval=pending" +
      "&gitops.changeType=image" +
      "&gitops.q=release" +
      "&checks.severity=critical" +
      "&checks.category=security" +
      "&checks.q=policy",
    );
    expect(parseProductFilterUrl(search).state).toEqual({
      ...state,
      common: {
        clusters: ["cluster-a", "cluster-b"],
        namespaces: [
          { clusterId: "cluster-a", namespace: "shop" },
          { clusterId: "unknown/cluster", namespace: "platform" },
        ],
        applications: ["app-a", "app-b"],
        labels: [
          { key: "app.kubernetes.io/name", value: "checkout" },
          { key: "team", value: "checkout" },
          { key: "tier", value: "critical" },
        ],
      },
      resources: { ...state.resources, types: ["Deployment", "Pod"], health: ["degraded", "healthy"] },
      issues: {
        ...state.issues,
        severity: ["critical", "warning"],
        category: ["container_restart", "scheduling"],
      },
    });
  });

  it("keeps Label as an AND axis, including contradictory values for the same key", () => {
    const result = parseProductFilterUrl(
      "?labels=environment%3Dprod,environment%3Dstaging,team%3Dcheckout",
    );

    expect(COMMON_FILTER_AXIS_OPERATORS).toEqual({
      clusters: "or",
      namespaces: "or",
      applications: "or",
      labels: "and",
    });
    expect(result.state.common.labels).toEqual([
      { key: "environment", value: "prod" },
      { key: "environment", value: "staging" },
      { key: "team", value: "checkout" },
    ]);
  });

  it("accepts Kubernetes equality Labels, preserves empty values, and isolates malformed entries", () => {
    const result = parseProductFilterUrl(
      "?labels=team%3Dcheckout,bad,UPPER.PREFIX%2Fname%3Dx,empty%3D," +
      "app.kubernetes.io%2Fname%3Dcheckout,team%3Dcheckout",
    );

    expect(result.state.common.labels).toEqual([
      { key: "app.kubernetes.io/name", value: "checkout" },
      { key: "empty", value: "" },
      { key: "team", value: "checkout" },
    ]);
    expect(result.invalidValues.labels).toEqual(["bad", "UPPER.PREFIX/name=x"]);
    expect(serializeProductFilterUrl(result.state)).toContain(
      "labels=app.kubernetes.io%2Fname%3Dcheckout,empty%3D,team%3Dcheckout",
    );
  });

  it("migrates legacy cluster and resource kind without choosing a default Cluster", () => {
    const legacy = parseProductFilterUrl(
      "?cluster=unknown%2Fcluster&resource=shop%2Fapi&kind=Pod&tab=events&full=1&node=worker-a",
    );

    expect(legacy.needsCanonicalWrite).toBe(true);
    expect(legacy.state.common.clusters).toEqual(["unknown/cluster"]);
    expect(legacy.detail).toEqual({
      detail: null,
      resource: "shop/api",
      resourceKind: "Pod",
      tab: "events",
      full: true,
      node: "worker-a",
    });
    expect(canonicalizeProductFilterUrl(
      "?cluster=unknown%2Fcluster&resource=shop%2Fapi&kind=Pod&tab=events&full=1&node=worker-a",
    )).toBe(
      "?clusters=unknown%2Fcluster&resource=shop%2Fapi&resourceKind=Pod" +
      "&tab=events&full=true&node=worker-a",
    );
    expect(serializeProductFilterUrl(createEmptyUnifiedFilterState())).toBe("");
  });

  it("lets canonical keys win when legacy and canonical keys coexist", () => {
    const result = parseProductFilterUrl(
      "?clusters=cluster-b&cluster=cluster-a&resource=shop%2Fapi" +
      "&resourceKind=Deployment&kind=Pod",
    );

    expect(result.state.common.clusters).toEqual(["cluster-b"]);
    expect(result.detail.resourceKind).toBe("Deployment");
    expect(canonicalizeProductFilterUrl(
      "?clusters=cluster-b&cluster=cluster-a&resource=shop%2Fapi" +
      "&resourceKind=Deployment&kind=Pod",
    )).toBe("?clusters=cluster-b&resource=shop%2Fapi&resourceKind=Deployment");
  });

  it("does not revive a legacy kind when the canonical detail key is explicitly empty", () => {
    const result = parseProductFilterUrl(
      "?resource=shop%2Fapi&resourceKind=&kind=Pod",
    );

    expect(result.detail).toEqual({
      detail: null,
      resource: "shop/api",
      resourceKind: null,
      tab: null,
      full: false,
      node: null,
    });
    expect(canonicalizeProductFilterUrl(
      "?resource=shop%2Fapi&resourceKind=&kind=Pod",
    )).toBe("?resource=shop%2Fapi");
  });

  it("combines repeated params and sorts by Unicode code point deterministically", () => {
    const once = canonicalizeProductFilterUrl(
      "?clusters=%F0%9F%98%80,%EE%80%80&clusters=%F0%9F%98%80" +
      "&labels=tier%3Dcritical&labels=team%3Dcheckout",
    );

    expect(once).toBe(
      "?clusters=%EE%80%80,%F0%9F%98%80&labels=team%3Dcheckout,tier%3Dcritical",
    );
    expect(canonicalizeProductFilterUrl(once)).toBe(once);
  });

  it("never turns an encoded comma or malformed UTF-8 into multiple filters", () => {
    const result = parseProductFilterUrl(
      "?clusters=cluster-a%2Ccluster-b&clusters=%E0%A4%A" +
      "&namespaces=cluster-a%2Fshop%2Ccluster-b%2Fplatform" +
      "&labels=team%3Dcheckout%2Ctier%3Dcritical",
    );

    expect(result.state.common).toEqual({
      clusters: [],
      namespaces: [],
      applications: [],
      labels: [],
    });
    expect(result.invalidValues.clusters).toEqual(["%E0%A4%A", "cluster-a,cluster-b"]);
    expect(result.invalidValues.namespaces).toEqual([
      "cluster-a/shop,cluster-b/platform",
    ]);
    expect(result.invalidValues.labels).toEqual([
      "team=checkout,tier=critical",
    ]);
  });

  it("validates Kubernetes namespace and apimachinery Label prefix boundaries", () => {
    const acceptedSegmentPrefix = "a".repeat(63);
    const acceptedTotalPrefix = [63, 63, 63, 61]
      .map((length) => "a".repeat(length))
      .join(".");
    const rejectedSegmentPrefix = "a".repeat(64);
    const rejectedTotalPrefix = [63, 63, 63, 62]
      .map((length) => "a".repeat(length))
      .join(".");
    const result = parseProductFilterUrl(
      `?namespaces=cluster-a%2Fshop,cluster-a%2Fbad%20namespace` +
      `&labels=${encodeURIComponent(`${acceptedSegmentPrefix}/name=value`)},` +
      `${encodeURIComponent(`${acceptedTotalPrefix}/name=value`)},` +
      `${encodeURIComponent(`${rejectedSegmentPrefix}/name=value`)},` +
      encodeURIComponent(`${rejectedTotalPrefix}/name=value`),
    );

    expect(result.state.common.namespaces).toEqual([
      { clusterId: "cluster-a", namespace: "shop" },
    ]);
    expect(result.invalidValues.namespaces).toEqual(["cluster-a/bad namespace"]);
    expect(result.state.common.labels).toEqual([
      { key: `${acceptedTotalPrefix}/name`, value: "value" },
      { key: `${acceptedSegmentPrefix}/name`, value: "value" },
    ]);
    expect(result.invalidValues.labels).toEqual([
      `${rejectedSegmentPrefix}/name=value`,
      `${rejectedTotalPrefix}/name=value`,
    ]);
  });

  it("preserves unresolved valid IDs across surfaces and drops detail-only state", () => {
    const href = productFilterNavigationHref(
      "/issues",
      "?clusters=unknown%2Fcluster&namespaces=unknown%2Fcluster%2Fplatform" +
      "&applications=unknown-app&labels=team%3Dcheckout" +
      "&resources.types=Pod&issues.status=open&resource=platform%2Fapi" +
      "&resourceKind=Pod&tab=events&full=true&node=worker-a&debug=1",
    );

    expect(href).toBe(
      "/issues?clusters=unknown%2Fcluster" +
      "&namespaces=unknown%2Fcluster%2Fplatform" +
      "&applications=unknown-app&labels=team%3Dcheckout" +
      "&resources.types=Pod&issues.status=open",
    );
  });
});
