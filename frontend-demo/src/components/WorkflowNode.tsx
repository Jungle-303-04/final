import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, Loader2, Pause, Square, Trash2 } from 'lucide-react';
import type { PointerEvent } from 'react';
import { statusLabels, uiText } from '../data/labels';
import { resolveModuleContract } from '../data/moduleContracts';
import type { NodeBlock, NodeField, SignalEdge, WorkflowNode as WorkflowNodeType } from '../types';

function StatusIcon({ status }: { status: WorkflowNodeType['data']['status'] }) {
  if (status === 'running') return <Loader2 className="spin" size={14} />;
  if (status === 'done') return <Check size={14} />;
  if (status === 'blocked') return <Pause size={14} />;
  return <Square size={11} />;
}

function metricValue(data: WorkflowNodeType['data']) {
  if (typeof data.metric !== 'number') return null;
  const value = data.metric > 0 && data.metric < 1 ? data.metric.toFixed(2) : String(data.metric);
  return `${value}${data.metricUnit ?? ''}`;
}

function FieldControl({
  field,
  onChange,
}: {
  field: NodeField;
  onChange: (value: string) => void;
}) {
  const common = {
    className: 'nodrag node-control',
    onPointerDown: (event: PointerEvent) => event.stopPropagation(),
  };

  if (field.kind === 'toggle') {
    return (
      <button
        type="button"
        {...common}
        aria-pressed={field.value === 'on'}
        onClick={() => onChange(field.value === 'on' ? 'off' : 'on')}
      >
        <i className={`toggle ${field.value === 'on' ? 'is-on' : ''}`} />
      </button>
    );
  }

  if (field.kind === 'select') {
    return (
      <select {...common} value={field.value} onChange={(event) => onChange(event.target.value)}>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'textarea') {
    return <textarea {...common} value={field.value} onChange={(event) => onChange(event.target.value)} />;
  }

  return (
    <div className="node-input-wrap">
      <input
        {...common}
        type={field.kind === 'number' ? 'number' : 'text'}
        value={field.value}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.unit ? <em>{field.unit}</em> : null}
    </div>
  );
}

function NodeRows({
  rows,
  accent,
  limit,
}: {
  rows: WorkflowNodeType['data']['rows'];
  accent: WorkflowNodeType['data']['accent'];
  limit?: number;
}) {
  const visibleRows = typeof limit === 'number' ? rows.slice(0, limit) : rows;
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className="node-rows">
      {visibleRows.map((row) => (
        <div className="node-row" key={row.id}>
          <span>
            <i className={`row-port tone-${row.tone ?? accent}`} />
            {row.label}
          </span>
          {row.value ? (
            <strong title={row.detail}>
              {row.value}
              {row.unit ? <em>{row.unit}</em> : null}
            </strong>
          ) : null}
        </div>
      ))}
      {hiddenCount > 0 ? <div className="node-more">+{hiddenCount}개 더</div> : null}
    </div>
  );
}

function NodeFields({
  fields,
  onFieldChange,
}: {
  fields: NodeField[];
  onFieldChange: (fieldId: string, value: string) => void;
}) {
  return (
    <div className="node-fields">
      {fields.map((field) => (
        <label className={`node-field field-${field.kind ?? 'text'}`} key={field.id}>
          <span>{field.label}</span>
          <FieldControl field={field} onChange={(value) => onFieldChange(field.id, value)} />
        </label>
      ))}
    </div>
  );
}

function NestedBlock({
  block,
  onFieldChange,
}: {
  block: NodeBlock;
  onFieldChange: (blockId: string, fieldId: string, value: string) => void;
}) {
  const accent = block.accent ?? 'blue';
  return (
    <section className={`node-block block-${accent}`}>
      <header>
        <span className={`node-accent accent-${accent}`} />
        <div>
          <strong>{block.title}</strong>
          {block.subtitle ? <small>{block.subtitle}</small> : null}
        </div>
      </header>
      {block.rows?.length ? <NodeRows rows={block.rows} accent={accent} limit={2} /> : null}
      {block.fields?.length ? (
        <NodeFields fields={block.fields} onFieldChange={(fieldId, value) => onFieldChange(block.id, fieldId, value)} />
      ) : null}
    </section>
  );
}

export function WorkflowNode({ id, data, selected }: NodeProps<WorkflowNodeType>) {
  const { setNodes } = useReactFlow<WorkflowNodeType, SignalEdge>();
  const inputs = data.ports?.filter((port) => port.direction === 'input') ?? [];
  const outputs = data.ports?.filter((port) => port.direction === 'output') ?? [];
  const metric = metricValue(data);
  const expanded = !data.collapsed;
  const moduleContract = resolveModuleContract(id);

  const updateField = (fieldId: string, value: string) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                fields: node.data.fields?.map((field) => (field.id === fieldId ? { ...field, value } : field)),
              },
            }
          : node,
      ),
    );
  };

  const updateBlockField = (blockId: string, fieldId: string, value: string) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                blocks: node.data.blocks?.map((block) =>
                  block.id === blockId
                    ? {
                        ...block,
                        fields: block.fields?.map((field) => (field.id === fieldId ? { ...field, value } : field)),
                      }
                    : block,
                ),
              },
            }
          : node,
      ),
    );
  };

  const toggleNodeCollapsed = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setNodes((current) =>
      current.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                collapsed: !node.data.collapsed,
              },
            }
          : node,
      ),
    );
  };

  return (
    <article
      className={`workflow-node node-${data.accent} status-${data.status} ${selected ? 'is-selected' : ''} ${expanded ? '' : 'is-collapsed'}`}
    >
      {inputs.length ? (
        inputs.map((port, index) => (
          <Handle
            className={`node-handle target-handle handle-${port.tone ?? data.accent}`}
            id={port.id}
            key={port.id}
            type="target"
            position={Position.Left}
            style={{ top: `${34 + index * 26}px` }}
          />
        ))
      ) : (
        <Handle className="node-handle target-handle" type="target" position={Position.Left} />
      )}
      {outputs.length ? (
        outputs.map((port, index) => (
          <Handle
            className={`node-handle source-handle handle-${port.tone ?? data.accent}`}
            id={port.id}
            key={port.id}
            type="source"
            position={Position.Right}
            style={{ top: `${34 + index * 26}px` }}
          />
        ))
      ) : (
        <Handle className="node-handle source-handle" type="source" position={Position.Right} />
      )}

      <header className="node-header">
        <div className="node-title">
          <i className={`node-accent accent-${data.accent}`} />
          <strong>{data.title}</strong>
        </div>
        <div className="node-actions">
          <span className="node-status">
            <StatusIcon status={data.status} />
            {statusLabels[data.status]}
          </span>
          <Trash2 size={14} />
        </div>
      </header>

      <div className="node-subtitle-row">
        <span>{data.subtitle ?? uiText.canvas.fallbackStep}</span>
        {metric ? (
          <strong>
            {data.metricLabel ? <em>{data.metricLabel}</em> : null}
            {metric}
          </strong>
        ) : null}
      </div>

      <NodeRows rows={data.rows} accent={data.accent} limit={expanded ? 3 : 2} />

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            className="node-expandable"
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="node-contract">
              <p>{moduleContract.purpose}</p>
              <dl>
                <div>
                  <dt>입력</dt>
                  <dd title={moduleContract.input}>{moduleContract.input}</dd>
                </div>
                <div>
                  <dt>출력</dt>
                  <dd title={moduleContract.output}>{moduleContract.output}</dd>
                </div>
                <div>
                  <dt>수치</dt>
                  <dd title={moduleContract.metric}>{moduleContract.metric}</dd>
                </div>
              </dl>
            </div>

            {data.ports?.length ? (
              <div className="node-port-list">
                {data.ports.map((port) => (
                  <div className={`node-port-row port-${port.direction}`} key={port.id}>
                    <span>
                      <i className={`row-port tone-${port.tone ?? data.accent}`} />
                      {port.label}
                    </span>
                    <strong>
                      {port.event}
                      {typeof port.count === 'number' ? <em>{port.count}</em> : null}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}

            {data.fields?.length ? (
              <NodeFields fields={data.fields} onFieldChange={updateField} />
            ) : null}

            {data.blocks?.length ? (
              <div className="node-blocks">
                {data.blocks.map((block) => (
                  <NestedBlock block={block} key={block.id} onFieldChange={updateBlockField} />
                ))}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <footer className="node-footer">
        <button type="button" className="node-collapse-button nodrag" onClick={toggleNodeCollapsed}>
          <span>{expanded ? uiText.canvas.advanced : '설정 펼치기'}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </footer>
    </article>
  );
}
