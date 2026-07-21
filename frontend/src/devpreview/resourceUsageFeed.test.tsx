// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useResourceUsageSeries } from "./resourceUsageFeed";

// 실 `GET /api/clusters/{id}/usage` 응답 shape 재현: 메모리는 모든 표본에 있고 실사용
// CPU(cpu_mcores)는 일부 표본에만 있으며 cpu_request_mcores(정적 request)는 usage로
// 읽지 않아야 한다(라이브 관측: mem 288/288, cpu_mcores 21/288 형태).
function usageResponse(key: string) {
  const sample = (memMib: number, cpuMcores: number | null) => ({
    sampled_at: "2026-07-21T07:52:18.270488+00:00",
    usage: {
      pods: {
        [key]: {
          mem_mib: memMib,
          cpu_request_mcores: 50,
          ...(cpuMcores !== null ? { cpu_mcores: cpuMcores } : {}),
          phase: "Running",
          ready: "1/1",
          restarts: 0,
        },
      },
      nodes: {},
    },
  });
  return {
    cluster_id: "demo-server",
    samples: [sample(64, 12), sample(66, null), sample(65, null)],
  };
}

describe("useResourceUsageSeries", () => {
  afterEach(() => vi.restoreAllMocks());

  it("charts observed memory densely and actual CPU partially, never the static request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(usageResponse("yaml-demo/dev-demo-cache-0")), { status: 200 }),
    );

    const rendered = renderHook(() =>
      useResourceUsageSeries("demo-server", "pod", "yaml-demo", "dev-demo-cache-0"),
    );
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));

    const view = rendered.result.current;
    expect(view.sampleCount).toBe(3);
    expect(view.hasMemory).toBe(true);
    expect(view.memObserved).toBe(3);
    // cpu_mcores는 첫 표본에만 존재 → 부분 관측. cpu_request_mcores(50)는 절대 반영 안 됨.
    expect(view.hasCpu).toBe(true);
    expect(view.cpuObserved).toBe(1);
    expect(view.points.map((p) => p.memMib)).toEqual([64, 66, 65]);
    expect(view.points.map((p) => p.cpuMcores)).toEqual([12, null, null]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/clusters/demo-server/usage");
  });

  it("stays idle without a namespace for a pod scope and issues no request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useResourceUsageSeries("demo-server", "pod", null, "orphan"));
    expect(rendered.result.current.status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unavailable when no metric was observed for the target", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ cluster_id: "demo-server", samples: [{ sampled_at: null, usage: { pods: {}, nodes: {} } }] }), { status: 200 }),
    );
    const rendered = renderHook(() => useResourceUsageSeries("demo-server", "pod", "ns", "missing"));
    await waitFor(() => expect(rendered.result.current.status).toBe("unavailable"));
    expect(rendered.result.current.hasMemory).toBe(false);
  });
});
