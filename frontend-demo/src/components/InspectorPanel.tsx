import { Code2, LockKeyhole, MousePointerClick, Waypoints } from 'lucide-react';
import { statusLabels, uiText } from '../data/labels';
import { operationsSnapshot as ops } from '../data/operations';
import type { RuntimeMetrics, WorkflowNode } from '../types';

export function InspectorPanel({
  selectedNode,
  metrics,
  chartNodeVisible,
}: {
  selectedNode?: WorkflowNode;
  metrics: RuntimeMetrics;
  chartNodeVisible: boolean;
}) {
  return (
    <aside className="inspector-panel">
      <section className="inspector-section">
        <div className="inspector-title">
          <Waypoints size={16} />
          <span>{uiText.inspector.selectedNode}</span>
        </div>
        {selectedNode ? (
          <div className="selected-node-card">
            <span className={`accent-chip chip-${selectedNode.data.accent}`} />
            <h2>{selectedNode.data.title}</h2>
            <p>{selectedNode.data.subtitle}</p>
            <div className="selected-stat-row">
              <span>{uiText.inspector.status}</span>
              <strong>{statusLabels[selectedNode.data.status]}</strong>
            </div>
            <div className="selected-stat-row">
              <span>{uiText.inspector.rows}</span>
              <strong>{selectedNode.data.rows.length}</strong>
            </div>
            <div className="selected-stat-row">
              <span>블록/포트</span>
              <strong>{selectedNode.data.blocks?.length ?? 0}/{selectedNode.data.ports?.length ?? 0}</strong>
            </div>
          </div>
        ) : (
          <div className="empty-selection">
            <MousePointerClick size={18} />
            <span>{uiText.inspector.empty}</span>
          </div>
        )}
      </section>

      <section className="inspector-section">
        <div className="inspector-title">
          <Code2 size={16} />
          <span>{uiText.inspector.manifest}</span>
        </div>
        <pre className="manifest-box">{JSON.stringify(
          {
            [uiText.manifest.layout]: 'react-flow-canvas',
            [uiText.manifest.auth]: 'httpOnly 쿠키 세션',
            [uiText.manifest.chartNodeVisible]: chartNodeVisible,
            [uiText.manifest.widgets]: ['워크플로우 노드', '신호 연결선', '스파크라인', '게이지', '이벤트 스트림'],
            [uiText.manifest.metrics]: {
              [uiText.manifest.confidence]: ops.rca.confidence,
              [uiText.manifest.evidence]: `${ops.evidenceJobs.completed}/${ops.evidenceJobs.queued}`,
              pods_ready: `${ops.realtime.podsReady}/${ops.realtime.podsTotal}`,
              window_ms: ops.realtime.windowMs,
              seq: ops.realtime.seq,
            },
          },
          null,
          2,
        )}</pre>
      </section>

      <section className="inspector-section security-section">
        <div className="inspector-title">
          <LockKeyhole size={16} />
          <span>{uiText.inspector.browserBoundary}</span>
        </div>
        <ul className="boundary-list">
          <li>{uiText.inspector.noBearer}</li>
          <li>{uiText.inspector.credentials}</li>
          <li>{uiText.inspector.backendPermission}</li>
          <li>{uiText.inspector.serverSideTokens}</li>
        </ul>
      </section>
    </aside>
  );
}
