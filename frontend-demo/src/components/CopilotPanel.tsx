import { AnimatePresence, motion } from 'motion/react';
import {
  Bot,
  Check,
  ChevronDown,
  Cpu,
  FileText,
  GitBranchPlus,
  LineChart,
  Play,
  Send,
  Settings2,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { copilotActions, copilotMessages, copilotTools, promptSuggestions, studioNotes } from '../data/copilot';
import { statusLabels } from '../data/labels';
import type { CopilotTool, RuntimeMetrics, TimelineEvent, WorkflowNode } from '../types';

const actionIcons = {
  'run-rca': Play,
  'add-evidence': GitBranchPlus,
  'chart-node': LineChart,
};

function toolClass(tool: CopilotTool, enabled: boolean) {
  return `tool-token tool-${tool.accent} ${enabled ? 'is-selected' : ''}`;
}

export function CopilotPanel({
  selectedNode,
  metrics,
  events,
  live,
  chartNodeVisible,
  onRunFlow,
  onAddEvidence,
  onToggleChartNode,
}: {
  selectedNode?: WorkflowNode;
  metrics: RuntimeMetrics;
  events: TimelineEvent[];
  live: boolean;
  chartNodeVisible: boolean;
  onRunFlow: () => void;
  onAddEvidence: () => void;
  onToggleChartNode: () => void;
}) {
  const [enabledTools, setEnabledTools] = useState(() =>
    copilotTools.reduce<Record<string, boolean>>((map, tool) => ({ ...map, [tool.id]: tool.selected }), {}),
  );
  const assistantText = copilotMessages.find((message) => message.role === 'assistant')?.text ?? '';
  const [visibleText, setVisibleText] = useState(live ? '' : assistantText);
  const latestEvent = events[0];

  useEffect(() => {
    if (!live) {
      setVisibleText(assistantText);
      return undefined;
    }

    setVisibleText('');
    let index = 0;
    const id = window.setInterval(() => {
      index = Math.min(index + 2, assistantText.length);
      setVisibleText(assistantText.slice(0, index));
      if (index >= assistantText.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
  }, [assistantText, live, events.length]);

  const selectedToolCount = useMemo(
    () => Object.values(enabledTools).filter(Boolean).length,
    [enabledTools],
  );

  const runAction = (actionId: string) => {
    if (actionId === 'run-rca') onRunFlow();
    if (actionId === 'add-evidence') onAddEvidence();
    if (actionId === 'chart-node') onToggleChartNode();
  };

  return (
    <aside className="copilot-panel">
      <section className="copilot-hero">
        <div className="copilot-avatar">
          <Bot size={18} />
        </div>
        <div>
          <span>AI 운영 코파일럿</span>
          <strong>장애 분석, 도구 선택, 실행 계획을 한 화면에서 조립</strong>
        </div>
        <i className={`copilot-live ${live ? 'is-live' : ''}`} />
      </section>

      <section className="copilot-section node-settings-card">
        <header className="copilot-section-title">
          <Waypoints size={15} />
          <span>선택 노드 설정</span>
          <ChevronDown size={15} />
        </header>
        {selectedNode ? (
          <motion.div className="node-setting-body" key={selectedNode.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <span className={`accent-chip chip-${selectedNode.data.accent}`} />
              <strong>{selectedNode.data.title}</strong>
              <small>{statusLabels[selectedNode.data.status]}</small>
            </div>
            <label>
              신뢰 임계값
              <input type="range" min="0" max="100" value={Math.round(metrics.confidence)} readOnly />
            </label>
            <div className="setting-grid">
              <span>행 {selectedNode.data.rows.length}</span>
              <span>블록 {selectedNode.data.blocks?.length ?? 0}</span>
              <span>포트 {selectedNode.data.ports?.length ?? 0}</span>
            </div>
          </motion.div>
        ) : (
          <div className="empty-setting">
            <Settings2 size={16} />
            <span>캔버스에서 노드를 선택하면 설정이 여기서 열립니다.</span>
          </div>
        )}
      </section>

      <section className="copilot-section">
        <header className="copilot-section-title">
          <Cpu size={15} />
          <span>도구 선택</span>
          <strong>{selectedToolCount}/{copilotTools.length}</strong>
        </header>
        <div className="tool-token-grid">
          {copilotTools.map((tool) => (
            <button
              type="button"
              key={tool.id}
              className={toolClass(tool, Boolean(enabledTools[tool.id]))}
              onClick={() => setEnabledTools((current) => ({ ...current, [tool.id]: !current[tool.id] }))}
            >
              <span>
                <i />
                {tool.label}
              </span>
              <small>{tool.description}</small>
              {enabledTools[tool.id] ? <Check size={13} /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="copilot-section chat-card">
        <header className="copilot-section-title">
          <Sparkles size={15} />
          <span>채팅 인터랙션</span>
          {latestEvent ? <strong>{latestEvent.time}</strong> : null}
        </header>
        <div className="chat-thread">
          <article className="chat-message user-message">
            <span>사용자</span>
            <p>{copilotMessages[0].text}</p>
          </article>
          <article className="chat-message assistant-message">
            <span>AI</span>
            <p>
              {visibleText}
              {live && visibleText.length < assistantText.length ? <i className="typing-caret" /> : null}
            </p>
            <div className="inline-selection">
              <button type="button">confidence 0.92</button>
              <button type="button">pods 12/13</button>
              <button type="button">window 500ms</button>
            </div>
          </article>
        </div>
        <div className="prompt-suggestions">
          {promptSuggestions.map((suggestion) => (
            <button type="button" key={suggestion}>{suggestion}</button>
          ))}
        </div>
        <label className="prompt-box">
          <span>AI에게 요청</span>
          <div>
            <textarea value="이 원인으로 안전한 PR과 사용자 보고 초안을 만들어줘." readOnly />
            <button type="button" aria-label="전송">
              <Send size={15} />
            </button>
          </div>
        </label>
      </section>

      <section className="copilot-section">
        <header className="copilot-section-title">
          <FileText size={15} />
          <span>생성된 노트</span>
          <strong>{chartNodeVisible ? '차트 표시' : '차트 대기'}</strong>
        </header>
        <div className="note-stack">
          <AnimatePresence initial={false}>
            {studioNotes.map((note, index) => (
              <motion.article
                className={`studio-note note-${note.accent}`}
                key={note.id}
                layout
                initial={{ opacity: 0, x: 18, rotate: 0.8 }}
                animate={{ opacity: 1, x: 0, rotate: index % 2 ? -0.35 : 0.35 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                <span>{note.value}</span>
                <strong>{note.title}</strong>
                <p>{note.body}</p>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      </section>

      <section className="copilot-section action-stack">
        {copilotActions.map((action) => {
          const Icon = actionIcons[action.id as keyof typeof actionIcons];
          return (
            <button type="button" className={`action-card action-${action.accent}`} key={action.id} onClick={() => runAction(action.id)}>
              <Icon size={16} />
              <span>
                <strong>{action.title}</strong>
                <small>{action.detail}</small>
              </span>
              <em>{action.value}</em>
            </button>
          );
        })}
      </section>
    </aside>
  );
}
