import { motion } from 'motion/react';
import { Activity, Layers3, Radio, ShieldCheck, TimerReset } from 'lucide-react';
import { operationsSnapshot as ops } from '../data/operations';
import type { RealtimeFrame, RuntimeMetrics, TimelineEvent } from '../types';
import { AreaSparkline, SaturationBars } from './Charts';

export function StudioHud({
  metrics,
  events,
  frame,
}: {
  metrics: RuntimeMetrics;
  events: TimelineEvent[];
  frame: RealtimeFrame;
}) {
  return (
    <div className="studio-hud">
      <section className="hud-metrics">
        <article>
          <ShieldCheck size={15} />
          <span>RCA 신뢰도</span>
          <strong>{ops.rca.confidence.toFixed(2)}</strong>
        </article>
        <article>
          <Activity size={15} />
          <span>Pod 준비</span>
          <strong>{ops.realtime.podsReady}/{ops.realtime.podsTotal}</strong>
        </article>
        <article>
          <Layers3 size={15} />
          <span>증거</span>
          <strong>{ops.evidenceJobs.completed}/{ops.evidenceJobs.queued}</strong>
        </article>
        <article>
          <TimerReset size={15} />
          <span>윈도우</span>
          <strong>{ops.realtime.windowMs}ms</strong>
        </article>
      </section>

      <section className="hud-graphs">
        <div className="hud-chart">
          <header>
            <span>p95 지연</span>
            <strong>{metrics.latency.at(-1)?.value ?? 0}ms</strong>
          </header>
          <AreaSparkline points={metrics.latency} accent="blue" height={74} />
        </div>
        <div className="hud-wave">
          <header>
            <span>실시간 이벤트</span>
            <strong>{frame.throughput.toLocaleString()} evt/min</strong>
          </header>
          <div>
            {frame.bars.slice(0, 16).map((value, index) => (
              <motion.i
                key={`${index}-${value}`}
                style={{ height: `${value}%` }}
                animate={{ height: `${value}%`, opacity: [0.55, 1, 0.68] }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            ))}
          </div>
        </div>
        <div className="hud-saturation">
          <header>
            <span>포화도</span>
            <strong>관측 중</strong>
          </header>
          <SaturationBars points={metrics.saturation.slice(0, 3)} />
        </div>
      </section>

      <section className="hud-events">
        <header>
          <Radio size={14} />
          <span>전환 큐</span>
        </header>
        <div>
          {events.slice(0, 4).map((event) => (
            <motion.article key={event.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <i className={`tone-dot tone-${event.tone}`} />
              <span>{event.title}</span>
              <strong>{event.detail}</strong>
            </motion.article>
          ))}
        </div>
      </section>
    </div>
  );
}
