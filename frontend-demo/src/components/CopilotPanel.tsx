import { AnimatePresence, motion } from 'motion/react';
import {
  Bot,
  Check,
  ChevronDown,
  Cpu,
  FileText,
  GitBranchPlus,
  LayoutGrid,
  LineChart,
  Minimize2,
  Play,
  Send,
  Settings2,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { copilotActions, copilotMessages, copilotTools, promptSuggestions, studioNotes } from '../data/copilot';
import { statusLabels } from '../data/labels';
import { resolveModuleContract } from '../data/moduleContracts';
import type { CopilotTool, RuntimeMetrics, TimelineEvent, WorkflowNode } from '../types';
import { MotionButton } from './MotionPrimitives';
import { fadeRise, noteVariants, softSpring, staggerContainer, studioTransition } from '../motion/presets';

const actionIcons = {
  'run-rca': Play,
  'add-evidence': GitBranchPlus,
  'chart-node': LineChart,
  'auto-layout': LayoutGrid,
  'toggle-collapse': Minimize2,
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
  onAutoLayout,
  onToggleCollapse,
}: {
  selectedNode?: WorkflowNode;
  metrics: RuntimeMetrics;
  events: TimelineEvent[];
  live: boolean;
  chartNodeVisible: boolean;
  onRunFlow: () => void;
  onAddEvidence: () => void;
  onToggleChartNode: () => void;
  onAutoLayout: () => void;
  onToggleCollapse: () => void;
}) {
  const [enabledTools, setEnabledTools] = useState(() =>
    copilotTools.reduce<Record<string, boolean>>((map, tool) => ({ ...map, [tool.id]: tool.selected }), {}),
  );
  const assistantText = copilotMessages.find((message) => message.role === 'assistant')?.text ?? '';
  const [visibleText, setVisibleText] = useState(live ? '' : assistantText);
  const latestEvent = events[0];
  const moduleContract = resolveModuleContract(selectedNode?.id);

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
    if (actionId === 'auto-layout') onAutoLayout();
    if (actionId === 'toggle-collapse') onToggleCollapse();
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
          <span>모듈 의미</span>
          <ChevronDown size={15} />
        </header>
        <motion.div className="module-contract-card" key={moduleContract.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="module-contract-head">
            <span className={`accent-chip chip-${moduleContract.accent}`} />
            <strong>{moduleContract.title}</strong>
            <small>{selectedNode ? statusLabels[selectedNode.data.status] : '전체'}</small>
          </div>
          <p>{moduleContract.purpose}</p>
          <dl>
            <div>
              <dt>입력</dt>
              <dd>{moduleContract.input}</dd>
            </div>
            <div>
              <dt>출력</dt>
              <dd>{moduleContract.output}</dd>
            </div>
            <div>
              <dt>확인 수치</dt>
              <dd>{moduleContract.metric}</dd>
            </div>
          </dl>
          {selectedNode ? (
            <>
              <label>
                신뢰 임계값
                <input type="range" min="0" max="100" value={Math.round(metrics.confidence)} readOnly />
              </label>
              <div className="setting-grid">
                <span>행 {selectedNode.data.rows.length}</span>
                <span>블록 {selectedNode.data.blocks?.length ?? 0}</span>
                <span>포트 {selectedNode.data.ports?.length ?? 0}</span>
              </div>
            </>
          ) : (
            <div className="empty-setting">
              <Settings2 size={16} />
              <span>노드를 선택하면 이 계약이 선택 모듈 기준으로 바뀝니다.</span>
            </div>
          )}
        </motion.div>
      </section>

      <section className="copilot-section">
        <header className="copilot-section-title">
          <Cpu size={15} />
          <span>도구 선택</span>
          <strong>{selectedToolCount}/{copilotTools.length}</strong>
        </header>
        <motion.div className="tool-token-grid" variants={staggerContainer} initial="hidden" animate="visible">
          {copilotTools.map((tool) => (
            <MotionButton
              type="button"
              key={tool.id}
              className={toolClass(tool, Boolean(enabledTools[tool.id]))}
              variants={fadeRise}
              onClick={() => setEnabledTools((current) => ({ ...current, [tool.id]: !current[tool.id] }))}
            >
              <span>
                <i />
                {tool.label}
              </span>
              <small>{tool.description}</small>
              {enabledTools[tool.id] ? <Check size={13} /> : null}
            </MotionButton>
          ))}
        </motion.div>
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
            <MotionButton type="button" key={suggestion}>{suggestion}</MotionButton>
          ))}
        </div>
        <label className="prompt-box">
          <span>AI에게 요청</span>
          <div>
            <textarea value="이 원인으로 안전한 PR과 사용자 보고 초안을 만들어줘." readOnly />
            <MotionButton type="button" aria-label="전송">
              <Send size={15} />
            </MotionButton>
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
                custom={index}
                variants={noteVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={softSpring}
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
            <MotionButton
              className={`action-card action-${action.accent}`}
              key={action.id}
              onClick={() => runAction(action.id)}
              transition={studioTransition}
            >
              <Icon size={16} />
              <span>
                <strong>{action.title}</strong>
                <small>{action.detail}</small>
              </span>
              <em>{action.value}</em>
            </MotionButton>
          );
        })}
      </section>
    </aside>
  );
}
