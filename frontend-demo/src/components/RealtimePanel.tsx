import { motion } from 'motion/react';
import { Activity, RadioTower, ShieldCheck, Zap } from 'lucide-react';
import type { RealtimeFrame } from '../types';

export function RealtimePanel({ frame }: { frame: RealtimeFrame }) {
  return (
    <section className="realtime-card">
      <div className="realtime-heading">
        <div>
          <span>실시간 더미 스트림</span>
          <strong>{frame.throughput.toLocaleString()} evt/min</strong>
        </div>
        <RadioTower size={17} />
      </div>
      <div className="live-wave">
        {frame.bars.map((value, index) => (
          <motion.i
            key={`${index}-${value}`}
            style={{ height: `${value}%` }}
            animate={{ height: `${value}%`, opacity: [0.64, 1, 0.72] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        ))}
      </div>
      <div className="realtime-stats">
        <span>
          <Activity size={14} />
          부하 {frame.load}%
        </span>
        <span>
          <ShieldCheck size={14} />
          건강 {frame.health}%
        </span>
        <span>
          <Zap size={14} />
          위험 {frame.risk}%
        </span>
      </div>
      <div className="realtime-events">
        {frame.events.slice(0, 3).map((event) => (
          <motion.article key={event.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <i className={`tone-dot tone-${event.tone}`} />
            <div>
              <strong>{event.title}</strong>
              <span>{event.detail}</span>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
