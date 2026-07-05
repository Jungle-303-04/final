import { motion } from 'motion/react';
import {
  Activity,
  Bot,
  Cloud,
  Code2,
  Database,
  Gauge,
  GitBranch,
  GitPullRequest,
  LockKeyhole,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { featurePages } from '../data/features';
import { uiText } from '../data/labels';
import { operationsSnapshot as ops } from '../data/operations';
import type { FeaturePageId, RealtimeFrame, RuntimeMetrics, TimelineEvent } from '../types';
import { AreaSparkline, BarStack, DonutGauge, SaturationBars } from './Charts';
import { RealtimePanel } from './RealtimePanel';

const pageIcons = {
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

export function DashboardPanel({
  metrics,
  events,
  live,
  activePage,
  onPageChange,
  realtimeFrame,
}: {
  metrics: RuntimeMetrics;
  events: TimelineEvent[];
  live: boolean;
  activePage: FeaturePageId;
  onPageChange: (page: FeaturePageId) => void;
  realtimeFrame: RealtimeFrame;
}) {
  return (
    <aside className="dashboard-panel">
      <div className="panel-heading">
        <div>
          <p>{uiText.sidebar.kicker}</p>
          <h1>{uiText.sidebar.title}</h1>
        </div>
        <span className={`live-pill ${live ? 'is-live' : ''}`}>
          <i />
          {live ? uiText.sidebar.live : uiText.sidebar.paused}
        </span>
      </div>

      <nav className="feature-nav" aria-label={uiText.sidebar.navLabel}>
        {featurePages.map((page) => {
          const Icon = pageIcons[page.id];
          return (
            <button
              type="button"
              key={page.id}
              className={`feature-nav-item nav-${page.accent} ${activePage === page.id ? 'is-active' : ''}`}
              onClick={() => onPageChange(page.id)}
            >
              <Icon size={15} />
              <span>{page.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="metric-grid">
        <motion.div className="metric-card" layout>
          <ShieldCheck size={17} />
          <span>RCA confidence</span>
          <strong>{ops.rca.confidence.toFixed(2)}</strong>
        </motion.div>
        <motion.div className="metric-card" layout>
          <Activity size={17} />
          <span>pods ready</span>
          <strong>{ops.realtime.podsReady}/{ops.realtime.podsTotal}</strong>
        </motion.div>
        <motion.div className="metric-card" layout>
          <GitBranch size={17} />
          <span>evidence jobs</span>
          <strong>{ops.evidenceJobs.completed}/{ops.evidenceJobs.queued}</strong>
        </motion.div>
        <motion.div className="metric-card" layout>
          <Zap size={17} />
          <span>provider p95</span>
          <strong>{ops.evidenceJobs.providerLatencyP95Ms}ms</strong>
        </motion.div>
      </section>

      <RealtimePanel frame={realtimeFrame} />

      <section className="chart-card hero-chart">
        <div className="card-title-row">
          <div>
            <span>{uiText.metrics.latency}</span>
            <strong>{metrics.latency.at(-1)?.value ?? 0}ms</strong>
          </div>
          <small>{uiText.metrics.recoveryTrend}</small>
        </div>
        <AreaSparkline points={metrics.latency} accent="blue" />
      </section>

      <section className="two-column-charts">
        <div className="chart-card compact-chart">
          <DonutGauge value={metrics.confidence} accent="green" label={uiText.metrics.safe} />
        </div>
        <div className="chart-card compact-chart">
          <DonutGauge value={100 - metrics.blastRadius} accent="purple" label={uiText.metrics.scope} />
        </div>
      </section>

      <section className="chart-card">
        <div className="card-title-row">
          <div>
            <span>{uiText.metrics.evidenceMix}</span>
            <strong>{metrics.evidenceCount}{uiText.metrics.signalUnit}</strong>
          </div>
        </div>
        <BarStack points={metrics.incidents} />
      </section>

      <section className="chart-card">
        <div className="card-title-row">
          <div>
            <span>{uiText.metrics.saturation}</span>
            <strong>{uiText.metrics.watching}</strong>
          </div>
        </div>
        <SaturationBars points={metrics.saturation} />
      </section>

      <section className="timeline-card">
        <div className="card-title-row">
          <div>
            <span>{uiText.metrics.eventStream}</span>
            <strong>{uiText.metrics.auditTimeline}</strong>
          </div>
        </div>
        <div className="event-list">
          {events.slice(0, 5).map((event) => (
            <motion.article className="event-row" key={event.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <i className={`tone-dot tone-${event.tone}`} />
              <div>
                <span>{event.time}</span>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </section>
    </aside>
  );
}
