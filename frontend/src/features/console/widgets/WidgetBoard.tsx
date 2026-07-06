// 위젯 보드 — 4열 그리드 (아이폰 위젯 문법: 스팬 1~4칸)
// 추가 플로우: [+ 위젯] → ①폼 갤러리 → ②데이터(폼 빌더 ↔ 고급 쿼리) → ③표시·미리보기
// 저장: localStorage (역할 × 스코프 키) — 개인 화면 설정이므로 읽기 사용자도 편집 가능
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Chip, FormField, Input, Modal, TabList, WizardModal } from '@/plural-ui';
import { staggerChild, staggerParent } from '@/plural-ui/motion';
import { PlusIcon } from '@/plural-ui/icons';
import { useViewer, useVisibleClusters } from '../viewer';
import { evaluateWidget, parseQuery, stringifyQuery } from './engine';
import type { WidgetData } from './types';
import { WidgetBody } from './forms';
import { presetsFor } from './presets';
import {
  FORM_META,
  GROUP_FORMS,
  GROUP_LABEL,
  GROUPABLE_METRICS,
  GROUPS_FOR_LEVEL,
  METRIC_META,
  SPAN_RULES,
  scopeKey,
  scopeLabel,
  type MetricKey,
  type WidgetConfig,
  type WidgetForm,
  type WidgetScope,
} from './types';
import './widgets.css';

/* ── 지속성 (v2: 맵 위젯 도입으로 프리셋 개편) ── */
function storageKeyOf(roleId: string, scope: WidgetScope): string {
  return `co-widgets-v2:${roleId}:${scopeKey(scope)}`;
}

function loadWidgets(key: string, level: WidgetScope['level']): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as WidgetConfig[];
  } catch {
    /* 손상된 저장값은 프리셋으로 대체 */
  }
  return presetsFor(level);
}

/* ── 개별 위젯 카드 ────────────────────── */
function WidgetCard({
  config,
  scope,
  visibleIds,
  onEdit,
  onRemove,
}: {
  config: WidgetConfig;
  scope: WidgetScope;
  visibleIds: string[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  // 맵 폼은 쿼리 평가 없이 스코프를 직접 렌더 (I9)
  const data = useMemo<WidgetData>(
    () => (config.form === 'map' ? { kind: 'scalar', value: 0, unit: '' } : evaluateWidget(config, scope, visibleIds)),
    [config, scope, visibleIds],
  );
  const note = data.kind !== 'nodata' ? data.note : undefined;
  return (
    <motion.div
      variants={staggerChild}
      className="wb-card"
      style={{ gridColumn: `span ${config.span}` }}
    >
      <div className="wb-card-head">
        <span className="wb-card-title" title={config.query.raw ?? stringifyQuery(config.query)}>
          {config.title}
        </span>
        <div className="wb-card-actions">
          <button type="button" className="pl-caretbtn" title="편집" onClick={onEdit}>
            ✎
          </button>
          <button type="button" className="pl-caretbtn" title="삭제" onClick={onRemove}>
            ✕
          </button>
        </div>
      </div>
      <div className="wb-card-body">
        <WidgetBody config={config} data={data} scope={scope} />
      </div>
      {note && <div className="wb-card-note">{note}</div>}
    </motion.div>
  );
}

/* ── 추가/편집 위저드 ──────────────────── */
function WidgetWizard({
  open,
  scope,
  visibleIds,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  scope: WidgetScope;
  visibleIds: string[];
  initial?: WidgetConfig;
  onClose: () => void;
  onSubmit: (w: WidgetConfig) => void;
}) {
  const empty: WidgetConfig = {
    id: `w-${Date.now()}`,
    title: '',
    form: 'stat',
    query: { metric: 'cpu_use_pct' },
    span: 1,
  };
  const [draft, setDraft] = useState<WidgetConfig>(initial ?? empty);
  const [advanced, setAdvanced] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      const d = initial ?? { ...empty, id: `w-${Date.now()}` };
      setDraft(d);
      setAdvanced(!!d.query.raw);
      setRawText(d.query.raw ?? stringifyQuery(d.query));
      setRawError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const isGroupForm = GROUP_FORMS.includes(draft.form);
  const validGroups = GROUPS_FOR_LEVEL[scope.level];
  const validMetrics = (Object.keys(METRIC_META) as MetricKey[]).filter((m) =>
    isGroupForm ? GROUPABLE_METRICS.includes(m) : true,
  );

  const setForm = (form: WidgetForm) => {
    setDraft((d) => {
      const spans = SPAN_RULES[form];
      const groupForm = GROUP_FORMS.includes(form);
      return {
        ...d,
        form,
        span: form === 'map' ? 4 : spans.includes(d.span) ? d.span : spans[0],
        query: {
          ...d.query,
          // 그룹 폼 전환: 그룹 가능 메트릭·유효 그룹으로 보정 (모순 차단)
          metric: groupForm && !GROUPABLE_METRICS.includes(d.query.metric) ? 'cost_month' : d.query.metric,
          groupBy: groupForm ? (d.query.groupBy && validGroups.includes(d.query.groupBy) ? d.query.groupBy : validGroups[0]) : undefined,
          limit: groupForm ? (d.query.limit ?? 6) : undefined,
          raw: undefined,
        },
      };
    });
    setAdvanced(false);
    setRawError(null);
  };

  const applyRaw = (text: string) => {
    setRawText(text);
    const parsed = parseQuery(text);
    if (!parsed.ok) {
      setRawError(parsed.error);
      return;
    }
    // 그룹 폼인데 groupBy 없음 / 스칼라 폼인데 groupBy 있음 → 모순 차단
    if (isGroupForm && !parsed.query.groupBy) {
      setRawError(`${FORM_META[draft.form].label} 폼은 by <그룹>이 필요해요`);
      return;
    }
    if (!isGroupForm && parsed.query.groupBy) {
      setRawError(`${FORM_META[draft.form].label} 폼은 by <그룹>을 쓸 수 없어요 — 바/도넛/테이블을 선택하세요`);
      return;
    }
    if (parsed.query.groupBy && !validGroups.includes(parsed.query.groupBy)) {
      setRawError(`이 스코프(${scopeLabel(scope)})에서는 by ${parsed.query.groupBy}가 무의미해요 — 가능: ${validGroups.join(', ')}`);
      return;
    }
    setRawError(null);
    setDraft((d) => ({ ...d, query: parsed.query }));
  };

  const preview: WidgetConfig = {
    ...draft,
    title: draft.title.trim() || METRIC_META[draft.query.metric].label,
  };
  const canFinish = !advanced || !rawError;

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title={initial ? `위젯 편집 — ${initial.title}` : '위젯 추가'}
      finishLabel={initial ? '저장' : '추가'}
      onFinish={() => {
        if (canFinish) onSubmit(preview);
      }}
      steps={[
        {
          label: '폼',
          content: (
            <div className="wb-gallery">
              {(Object.keys(FORM_META) as WidgetForm[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`wb-gallery-card${draft.form === f ? ' on' : ''}`}
                  onClick={() => setForm(f)}
                >
                  <span className="wb-gallery-label">{FORM_META[f].label}</span>
                  <span className="pl-muted">{FORM_META[f].desc}</span>
                  <span className="pl-muted" style={{ fontSize: 11 }}>
                    스팬 {SPAN_RULES[f].join('·')}칸
                  </span>
                </button>
              ))}
            </div>
          ),
        },
        {
          label: '데이터',
          content: draft.form === 'map' ? (
            <>
              <Chip severity="info">스코프: {scopeLabel(scope)} (자동 주입)</Chip>
              <p className="pl-muted" style={{ margin: '12px 0 0' }}>
                맵은 쿼리 없이 현재 스코프를 드릴다운합니다 — 셀을 클릭하면 한 단계 깊은 페이지로
                이동해요. 렌즈·그룹은 맵 안에서 전환합니다.
              </p>
            </>
          ) : (
            <>
              <div className="pl-row pl-row--between" style={{ marginBottom: 12 }}>
                <Chip severity="info">스코프: {scopeLabel(scope)} (자동 주입)</Chip>
                <div className="pl-segment">
                  {(['빌더', '고급 쿼리'] as const).map((mode, i) => (
                    <button
                      key={mode}
                      type="button"
                      className={advanced === (i === 1) ? 'on' : ''}
                      onClick={() => {
                        setAdvanced(i === 1);
                        if (i === 1) setRawText(stringifyQuery(draft.query));
                        else {
                          setDraft((d) => ({ ...d, query: { ...d.query, raw: undefined } }));
                          setRawError(null);
                        }
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              {!advanced ? (
                <>
                  <FormField label="메트릭">
                    <select
                      className="pl-input"
                      value={draft.query.metric}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, query: { ...d.query, metric: e.target.value as MetricKey, raw: undefined } }))
                      }
                    >
                      {validMetrics.map((m) => (
                        <option key={m} value={m}>
                          {METRIC_META[m].label} ({METRIC_META[m].unit})
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {isGroupForm && (
                    <>
                      <FormField label="그룹 기준" hint={`이 스코프에서 가능한 기준: ${validGroups.map((g) => GROUP_LABEL[g]).join(', ')}`}>
                        <TabList
                          tabs={validGroups.map((g) => ({ key: g, label: GROUP_LABEL[g] }))}
                          value={draft.query.groupBy ?? validGroups[0]}
                          onChange={(g) => setDraft((d) => ({ ...d, query: { ...d.query, groupBy: g as typeof validGroups[number] } }))}
                        />
                      </FormField>
                      <FormField label="상위 N">
                        <TabList
                          tabs={[4, 6, 8, 12].map((n) => ({ key: String(n), label: `${n}개` }))}
                          value={String(draft.query.limit ?? 6)}
                          onChange={(n) => setDraft((d) => ({ ...d, query: { ...d.query, limit: Number(n) } }))}
                        />
                      </FormField>
                    </>
                  )}
                  <FormField label="이 폼이 만드는 쿼리" hint="고급 모드로 전환하면 직접 수정할 수 있어요.">
                    <div className="pl-codeblock">{stringifyQuery(draft.query)}</div>
                  </FormField>
                </>
              ) : (
                <FormField
                  label="쿼리"
                  hint='문법: metric{cluster="…"} [by 그룹] [limit N] — cluster 라벨로 스코프 재정의 가능'
                >
                  <Input value={rawText} onChange={applyRaw} placeholder='예: cost_month by service limit 5' />
                  {rawError && (
                    <p style={{ color: 'var(--color-text-danger)', margin: '8px 0 0', fontSize: 12 }}>{rawError}</p>
                  )}
                </FormField>
              )}
            </>
          ),
        },
        {
          label: '표시·미리보기',
          content: (
            <>
              <FormField label="제목">
                <Input
                  value={draft.title}
                  onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
                  placeholder={METRIC_META[draft.query.metric].label}
                />
              </FormField>
              <FormField label="스팬 (4등분 기준 칸 수)">
                <TabList
                  tabs={SPAN_RULES[draft.form].map((s) => ({ key: String(s), label: `${s}칸` }))}
                  value={String(draft.span)}
                  onChange={(s) => setDraft((d) => ({ ...d, span: Number(s) as WidgetConfig['span'] }))}
                />
              </FormField>
              <FormField label="미리보기">
                <div className="wb-grid" style={{ pointerEvents: 'none' }}>
                  <div className="wb-card" style={{ gridColumn: `span ${draft.span}` }}>
                    <div className="wb-card-head">
                      <span className="wb-card-title">{preview.title}</span>
                    </div>
                    <div className="wb-card-body">
                      <WidgetBody
                        config={preview}
                        data={
                          preview.form === 'map'
                            ? { kind: 'scalar', value: 0, unit: '' }
                            : evaluateWidget(preview, scope, visibleIds)
                        }
                        scope={scope}
                      />
                    </div>
                  </div>
                </div>
              </FormField>
              {rawError && <p style={{ color: 'var(--color-text-danger)', fontSize: 12 }}>쿼리 오류를 먼저 해결하세요: {rawError}</p>}
            </>
          ),
        },
      ]}
    />
  );
}

/* ── 보드 ─────────────────────────────── */
export function WidgetBoard({ scope }: { scope: WidgetScope }) {
  const { role } = useViewer();
  const { clusters } = useVisibleClusters(); // I6: 플릿 스코프의 유일한 분모
  const visibleIds = useMemo(() => clusters.map((c) => c.id), [clusters]);
  const key = storageKeyOf(role.id, scope);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => loadWidgets(key, scope.level));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editFor, setEditFor] = useState<WidgetConfig | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // 역할/스코프가 바뀌면 그 컨텍스트의 저장값을 다시 로드
  useEffect(() => {
    setWidgets(loadWidgets(key, scope.level));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = (next: WidgetConfig[]) => {
    setWidgets(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  return (
    <section className="wb-board">
      <div className="wb-board-head">
        <span className="wb-board-title">위젯</span>
        <div className="pl-row" style={{ gap: 8 }}>
          <Button size="small" onClick={() => setResetOpen(true)}>
            프리셋으로
          </Button>
          <Button size="small" variant="primary" onClick={() => setWizardOpen(true)}>
            <PlusIcon size={12} /> 위젯 추가
          </Button>
        </div>
      </div>
      <motion.div className="wb-grid" variants={staggerParent} initial="initial" animate="animate">
        <AnimatePresence>
          {widgets.map((w) => (
            <WidgetCard
              key={w.id}
              config={w}
              scope={scope}
              visibleIds={visibleIds}
              onEdit={() => setEditFor(w)}
              onRemove={() => persist(widgets.filter((x) => x.id !== w.id))}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      <WidgetWizard
        open={wizardOpen}
        scope={scope}
        visibleIds={visibleIds}
        onClose={() => setWizardOpen(false)}
        onSubmit={(w) => {
          persist([...widgets, w]);
          setWizardOpen(false);
        }}
      />
      {editFor && (
        <WidgetWizard
          open
          scope={scope}
          visibleIds={visibleIds}
          initial={editFor}
          onClose={() => setEditFor(null)}
          onSubmit={(w) => {
            persist(widgets.map((x) => (x.id === editFor.id ? { ...w, id: editFor.id } : x)));
            setEditFor(null);
          }}
        />
      )}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="프리셋으로 되돌리기"
        actions={
          <>
            <Button onClick={() => setResetOpen(false)}>취소</Button>
            <Button
              variant="primary"
              onClick={() => {
                persist(presetsFor(scope.level));
                setResetOpen(false);
              }}
            >
              되돌리기
            </Button>
          </>
        }
      >
        <p className="pl-muted" style={{ margin: 0 }}>
          이 화면의 위젯 구성을 기본 프리셋으로 되돌립니다. 직접 추가한 위젯은 사라져요.
        </p>
      </Modal>
    </section>
  );
}
