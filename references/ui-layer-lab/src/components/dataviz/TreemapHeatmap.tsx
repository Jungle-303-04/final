import { useMemo, useState } from "react";
import {
  clusterTreemapData,
  colorClass,
  layoutTreemap,
  metricLabel,
  metricUnit,
  type TreemapMetric,
  type TreemapRect
} from "../../examples/shared/treemap";

const modes: TreemapMetric[] = ["capacity", "errorRate", "traffic"];

export function TreemapHeatmap() {
  const [metric, setMetric] = useState<TreemapMetric>("capacity");
  const [problemOnly, setProblemOnly] = useState(false);
  const [selectedId, setSelectedId] = useState("cluster-02");

  const visibleNodes = useMemo(
    () =>
      clusterTreemapData.filter((node) => {
        if (!problemOnly) return true;
        return node.status === "주의" || node.status === "위험" || node.status === "정보 없음";
      }),
    [problemOnly]
  );
  const rects = useMemo(() => layoutTreemap(visibleNodes, metric), [metric, visibleNodes]);
  const selected = rects.find((rect) => rect.id === selectedId) ?? rects[0];

  return (
    <section className="treemap-panel" data-testid="treemap-example">
      <header className="treemap-header">
        <div>
          <strong>클러스터 트리맵 히트맵</strong>
          <span>면적은 선택한 값, 색상은 상태와 위험도를 함께 표현합니다.</span>
        </div>
        <div className="treemap-controls">
          <div className="segmented-control" aria-label="트리맵 기준 선택">
            {modes.map((mode) => (
              <button
                className={mode === metric ? "active" : ""}
                data-stable-control="treemap-metric"
                data-testid={`treemap-mode-${mode}`}
                key={mode}
                onClick={() => setMetric(mode)}
                type="button"
              >
                {metricLabel(mode)}
              </button>
            ))}
          </div>
          <button
            className="ui-button stable-wide"
            data-stable-control="treemap-filter"
            data-testid="treemap-problem-filter"
            onClick={() => setProblemOnly((value) => !value)}
            type="button"
          >
            {problemOnly ? "전체 보기" : "문제만 보기"}
          </button>
        </div>
      </header>

      <div className="treemap-frame" data-testid="treemap-frame">
        {rects.map((rect) => (
          <TreemapTile
            key={rect.id}
            metric={metric}
            rect={rect}
            selected={rect.id === selected?.id}
            onSelect={() => setSelectedId(rect.id)}
          />
        ))}
      </div>

      <div className="treemap-footer">
        <TreemapLegend />
        <aside className="treemap-inspector" data-testid="treemap-inspector">
          <span>선택 클러스터</span>
          <strong>{selected?.name ?? "선택 없음"}</strong>
          <p>
            {selected
              ? `${selected.environment} 환경 · ${selected.status} · ${metricLabel(metric)} ${
                  selected.areaValue === null ? "-" : `${selected.areaValue}${metricUnit(metric)}`
                }`
              : "타일을 선택하면 상세 정보가 표시됩니다."}
          </p>
        </aside>
      </div>
    </section>
  );
}

function TreemapTile({
  metric,
  rect,
  selected,
  onSelect
}: {
  metric: TreemapMetric;
  rect: TreemapRect;
  selected: boolean;
  onSelect: () => void;
}) {
  const value = rect.areaValue === null ? "-" : `${rect.areaValue}${metricUnit(metric)}`;

  return (
    <button
      aria-pressed={selected}
      className={`treemap-tile ${colorClass(rect)} ${selected ? "is-selected" : ""}`}
      data-testid="treemap-tile"
      onClick={onSelect}
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`
      }}
      title={`${rect.name} ${value}`}
      type="button"
    >
      <span className="treemap-tile-name">{rect.name}</span>
      <span className="treemap-tile-value">{value}</span>
      <span className="treemap-tile-status">{rect.status}</span>
    </button>
  );
}

function TreemapLegend() {
  return (
    <div className="treemap-legend" aria-label="트리맵 상태 범례">
      <span className="is-good">정상</span>
      <span className="is-warning">주의</span>
      <span className="is-danger">위험</span>
      <span className="is-disabled">정보 없음</span>
    </div>
  );
}
