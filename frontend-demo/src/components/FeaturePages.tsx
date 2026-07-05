import { motion } from 'motion/react';
import type { ElementType } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock3,
  Cloud,
  Code2,
  Database,
  Fingerprint,
  Gauge,
  GitPullRequest,
  LockKeyhole,
  ScrollText,
  Server,
  Sparkles,
} from 'lucide-react';
import { featureDemoContent, featurePages } from '../data/features';
import { uiText, resourceStateLabels } from '../data/labels';
import { screenCatalog } from '../data/screenCatalog';
import { GraphLab } from './GraphLab';
import { ScreenCatalog } from './ScreenCatalog';
import type { Accent, FeatureDemoContent, FeaturePage, FeaturePageId, RealtimeFrame, RuntimeMetrics, TimelineEvent } from '../types';
import { fadeRise, quickSpring, staggerContainer } from '../motion/presets';

const iconMap: Record<FeaturePageId, ElementType> = {
  'action-flow': GitPullRequest,
  fleet: Cloud,
  deployments: GitPullRequest,
  stacks: Code2,
  services: Server,
  observability: Database,
  'ai-ops': Bot,
  access: LockKeyhole,
  audit: ScrollText,
  'screen-catalog': Server,
  'graph-lab': Gauge,
  'animation-lab': Sparkles,
};

const accentLabels: Record<Accent, string> = uiText.featureBadges;

function FeatureHero({ feature }: { feature: FeaturePage }) {
  const Icon = iconMap[feature.id];

  return (
    <motion.section
      className={`feature-hero feature-${feature.accent}`}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="feature-hero-copy">
        <span className={`feature-badge badge-${feature.accent}`}>
          <Icon size={15} />
          {accentLabels[feature.accent]}
        </span>
        <h2>{feature.title}</h2>
        <p>{feature.summary}</p>
      </div>
      <div className="feature-stat-strip">
        {feature.stats.map((stat) => (
          <motion.article className="feature-stat" key={stat.label} layout>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.delta}</small>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}

function ClusterOrbit({ feature, content }: { feature: FeaturePage; content: FeatureDemoContent }) {
  return (
    <section className="orbit-card">
      <div className="orbit-core">
        <span />
        <strong>{feature.label}</strong>
      </div>
      {content.orbitItems.map((item, index) => (
        <motion.div
          className={`orbit-node orbit-${index + 1}`}
          key={item}
          animate={{ scale: [1, 1.06, 1], opacity: [0.74, 1, 0.74] }}
          transition={{ duration: 2.2 + index * 0.2, repeat: Infinity }}
        >
          <i />
          {item}
        </motion.div>
      ))}
      <div className="orbit-ring ring-one" />
      <div className="orbit-ring ring-two" />
    </section>
  );
}

function PipelineLanes({ accent, steps }: { accent: Accent; steps: FeatureDemoContent['pipelineSteps'] }) {
  return (
    <section className="lane-card">
      {steps.map((step, index) => (
        <motion.article
          className={`lane-step lane-${step.state} lane-accent-${accent}`}
          key={step.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.08 }}
        >
          <span>{step.label}</span>
          <strong>{step.detail}</strong>
          <i />
        </motion.article>
      ))}
    </section>
  );
}

function LogStream({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="terminal-card">
      <header>
        <span />
        <span />
        <span />
      </header>
      <div className="terminal-lines">
        {events.slice(0, 5).map((event, index) => (
          <motion.p key={event.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}>
            <span>{event.time}</span> {event.title} :: {event.detail}
          </motion.p>
        ))}
      </div>
    </section>
  );
}

function Heatmap({ cells }: { cells: number[] }) {
  return (
    <section className="heatmap-card">
      {cells.map((tone, index) => (
        <motion.i
          key={index}
          animate={{ opacity: [0.28, 0.95, 0.38] }}
          transition={{ duration: 1.8 + (index % 6) * 0.18, repeat: Infinity, delay: (index % 10) * 0.03 }}
          className={`heat-${tone}`}
        />
      ))}
    </section>
  );
}

function AccessMatrix({ matrix }: { matrix: FeatureDemoContent['accessMatrix'] }) {
  return (
    <section className="matrix-card">
      <div />
      {matrix.columns.map((column) => (
        <strong key={column}>{column}</strong>
      ))}
      {matrix.rows.map((row, rowIndex) => (
        <div className="matrix-row" key={row.id}>
          <span>{row.label}</span>
          {row.permissions.map((permission, columnIndex) => (
            <motion.i
              key={`${row.id}-${matrix.columns[columnIndex]}`}
              className={permission === 'denied' ? 'is-denied' : 'is-allowed'}
              animate={{ scale: [1, 1.16, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: (rowIndex + columnIndex) * 0.08 }}
            >
              {permission === 'denied' ? <Fingerprint size={12} /> : <CheckCircle2 size={12} />}
            </motion.i>
          ))}
        </div>
      ))}
    </section>
  );
}

function DataTable({ table }: { table: FeatureDemoContent['table'] }) {
  return (
    <section className="feature-table-card">
      <header>
        {table.columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </header>
      {table.rows.map((row) => (
        <motion.article key={row.id} layout>
          {row.cells.map((cell, index) => (
            <span key={`${row.id}-${cell}`} className={index === row.stateCellIndex ? `state-cell state-${cell}` : ''}>
              {index === row.stateCellIndex ? resourceStateLabels[cell] ?? cell : cell}
            </span>
          ))}
        </motion.article>
      ))}
    </section>
  );
}

function MotionLab({ samples }: { samples: FeatureDemoContent['motionSamples'] }) {
  return (
    <motion.section className="motion-lab-grid" variants={staggerContainer} initial="hidden" animate="visible">
      {samples.map((sample, index) => (
        <motion.article
          className={`motion-sample motion-sample-${(index % 4) + 1}`}
          key={sample.id}
          variants={fadeRise}
          whileHover={{ y: 'var(--motion-hover-y)', scale: 1.015 }}
          whileTap={{ scale: 0.985 }}
          drag={index === 0 ? 'x' : false}
          dragConstraints={{ left: -24, right: 24 }}
          transition={quickSpring}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{sample.label}</strong>
          <i />
        </motion.article>
      ))}
    </motion.section>
  );
}

function resolveAgentStepValue(step: FeatureDemoContent['agentSteps'][number], metrics: RuntimeMetrics) {
  if (!step.metric) return step.value ?? '';
  return `${metrics[step.metric]}${step.suffix ?? ''}`;
}

function FeatureSpecificSurface({
  feature,
  content,
  metrics,
  realtimeFrame,
  events,
}: {
  feature: FeaturePage;
  content: FeatureDemoContent;
  metrics: RuntimeMetrics;
  realtimeFrame: RealtimeFrame;
  events: TimelineEvent[];
}) {
  if (feature.id === 'screen-catalog') return <ScreenCatalog screens={screenCatalog} />;
  if (feature.id === 'graph-lab') return <GraphLab frame={realtimeFrame} metrics={metrics} />;
  if (feature.id === 'animation-lab') return <MotionLab samples={content.motionSamples} />;
  if (feature.id === 'access') return <AccessMatrix matrix={content.accessMatrix} />;
  if (feature.id === 'observability' || feature.id === 'audit') return <Heatmap cells={content.heatmapCells} />;
  if (feature.id === 'deployments' || feature.id === 'stacks') return <PipelineLanes accent={feature.accent} steps={content.pipelineSteps} />;
  if (feature.id === 'ai-ops') {
    return (
      <section className="agent-card">
        {content.agentSteps.map((step, index) => (
          <motion.article key={step.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}>
            <Clock3 size={15} />
            <span>{step.label}</span>
            <strong>{resolveAgentStepValue(step, metrics)}</strong>
          </motion.article>
        ))}
      </section>
    );
  }
  return <ClusterOrbit feature={feature} content={content} />;
}

export function FeatureWorkspace({
  pageId,
  metrics,
  events,
  realtimeFrame,
  onPageChange,
}: {
  pageId: FeaturePageId;
  metrics: RuntimeMetrics;
  events: TimelineEvent[];
  realtimeFrame: RealtimeFrame;
  onPageChange: (pageId: FeaturePageId) => void;
}) {
  const feature = featurePages.find((item) => item.id === pageId) ?? featurePages[0];
  const content = featureDemoContent[feature.id];

  return (
    <motion.div className="feature-workspace" key={feature.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
      <FeatureHero feature={feature} />

      <div className="feature-layout">
        <FeatureSpecificSurface feature={feature} content={content} metrics={metrics} realtimeFrame={realtimeFrame} events={events} />
        <div className="feature-side-stack">
          <PipelineLanes accent={feature.accent} steps={content.pipelineSteps} />
          <LogStream events={events} />
        </div>
        <DataTable table={content.table} />
      </div>

      <section className="page-map">
        {featurePages.map((page, index) => {
          const Icon = iconMap[page.id];
          return (
            <motion.button
              type="button"
              key={page.id}
              onClick={() => onPageChange(page.id)}
              className={`page-map-item map-${page.accent} ${page.id === pageId ? 'is-current' : ''}`}
              whileHover={{ y: -4 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035 }}
            >
              <Icon size={16} />
              <span>{page.label}</span>
            </motion.button>
          );
        })}
      </section>
    </motion.div>
  );
}
