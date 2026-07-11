import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api";
import { MetricQueryExecutionError } from "../../api/metrics";
import { Surface } from "../../shared/ui/Surface";
import { runMetricPreset, type MetricPresetRun } from "./metricRunner";
import { METRIC_PRESETS, type MetricPreset } from "./presets";
import type { MetricClusterOption } from "./useMetricsConnections";

type PresetRunState =
  | { status: "running" }
  | { status: "succeeded"; run: MetricPresetRun }
  | { status: "failed"; message: string };

export function MetricPresetPanel({ cluster }: { cluster: MetricClusterOption }) {
  const [runs, setRuns] = useState<Readonly<Record<string, PresetRunState>>>({});
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const activeControllers = controllers.current;
    return () => {
      for (const controller of activeControllers.values()) controller.abort();
      activeControllers.clear();
    };
  }, []);

  async function execute(preset: MetricPreset) {
    if (controllers.current.has(preset.id)) return;
    const controller = new AbortController();
    controllers.current.set(preset.id, controller);
    setRuns((current) => ({ ...current, [preset.id]: { status: "running" } }));

    try {
      const run = await runMetricPreset(
        cluster.clusterId,
        preset,
        `run-${crypto.randomUUID()}`,
        { signal: controller.signal },
      );
      setRuns((current) => ({ ...current, [preset.id]: { status: "succeeded", run } }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setRuns((current) => ({
        ...current,
        [preset.id]: { status: "failed", message: metricErrorMessage(error) },
      }));
    } finally {
      controllers.current.delete(preset.id);
    }
  }

  return (
    <section className="metric-presets" aria-labelledby="metric-presets-title">
      <header className="section-heading">
        <div>
          <span className="eyebrow">PROMQL PRESETS</span>
          <h2 id="metric-presets-title">실행 가능한 관측 쿼리</h2>
        </div>
        <span className="section-heading__detail">{cluster.name}</span>
      </header>
      <div className="metric-preset-grid">
        {METRIC_PRESETS.map((preset) => {
          const run = runs[preset.id];
          const isRunning = run?.status === "running";
          return (
            <Surface className="metric-preset" key={preset.id}>
              <div>
                <span className="eyebrow">{preset.unit}</span>
                <h3>{preset.label}</h3>
                <p>{preset.description}</p>
              </div>
              <code>{preset.promql}</code>
              <PresetOutcome state={run} />
              <button
                className="button button--secondary"
                disabled={isRunning}
                type="button"
                onClick={() => void execute(preset)}
              >
                {isRunning ? "실행 상태 확인 중…" : "실제 쿼리 실행"}
              </button>
            </Surface>
          );
        })}
      </div>
    </section>
  );
}

function PresetOutcome({ state }: { state: PresetRunState | undefined }) {
  if (state === undefined) return <span className="metric-preset__outcome">실행 전</span>;
  if (state.status === "running") return <span className="metric-preset__outcome">queued → command polling</span>;
  if (state.status === "failed") return <span className="metric-preset__outcome metric-preset__outcome--error">{state.message}</span>;
  return <span className="metric-preset__outcome">실측 {state.run.result.point_count} points</span>;
}

function metricErrorMessage(error: unknown): string {
  if (error instanceof MetricQueryExecutionError || error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "메트릭 쿼리 실행 상태를 확인할 수 없습니다.";
}
