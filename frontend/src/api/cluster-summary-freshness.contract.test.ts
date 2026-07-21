import { describe, expect, it } from "vitest";

import { clusterNodesSummarySchema } from "./cluster-summary-schemas";

// A 계약 변경(metrics_observed_at + metrics_stale) 프런트 수용 계약 — rolling 호환:
// 구버전 응답(필드 없음)과 신버전 응답(필드 있음)이 모두 파싱되고, stale=true 여도
// 수치는 폐기되지 않는다(마지막 실측값 그대로 노출, fabrication 0).

const NODE = {
  name: "worker-a", ready: true, health: "healthy", kubernetes_version: "v1.32.0",
  pods_running: 3, pods_capacity: 29, cpu_pct: 12.5, mem_pct: 30.1,
  restarts_recent: 0, conditions: ["Ready"],
};

describe("cluster nodes summary — freshness 필드 rolling 호환", () => {
  it("구버전 응답(freshness 필드 없음)을 그대로 수용한다", () => {
    const parsed = clusterNodesSummarySchema.parse({ cluster_id: "c1", nodes: [NODE] });
    expect(parsed.metrics_observed_at).toBeUndefined();
    expect(parsed.metrics_stale).toBeUndefined();
    expect(parsed.nodes[0]?.cpu_pct).toBe(12.5);
  });

  it("신버전 응답의 metrics_observed_at/metrics_stale 을 응답·노드 레벨 모두 수용한다", () => {
    const parsed = clusterNodesSummarySchema.parse({
      cluster_id: "c1",
      metrics_observed_at: "2026-07-22T05:00:00Z",
      metrics_stale: true,
      nodes: [{ ...NODE, metrics_observed_at: "2026-07-22T05:00:00Z", metrics_stale: true }],
    });
    expect(parsed.metrics_stale).toBe(true);
    expect(parsed.metrics_observed_at).toBe("2026-07-22T05:00:00Z");
    // stale 이어도 마지막 실측값은 그대로 — 수치 폐기 금지.
    expect(parsed.nodes[0]?.cpu_pct).toBe(12.5);
    expect(parsed.nodes[0]?.metrics_stale).toBe(true);
  });

  it("stale=false·시각 null 조합도 정직하게 통과한다", () => {
    const parsed = clusterNodesSummarySchema.parse({
      cluster_id: "c1", metrics_observed_at: null, metrics_stale: false, nodes: [],
    });
    expect(parsed.metrics_observed_at).toBeNull();
    expect(parsed.metrics_stale).toBe(false);
  });
});
