import { motion } from 'motion/react';
import { graphModules, graphNetworkNodes } from '../data/graphLab';
import { AreaSparkline, BarStack, DonutGauge } from './Charts';
import type { GraphModule, RealtimeFrame, RuntimeMetrics } from '../types';

function GraphModuleView({
  module,
  frame,
  metrics,
}: {
  module: GraphModule;
  frame: RealtimeFrame;
  metrics: RuntimeMetrics;
}) {
  if (module.kind === 'stream') {
    const points = frame.bars.map((value, index) => ({ label: `${index}`, value }));
    return <AreaSparkline points={points} accent={module.accent} height={132} />;
  }

  if (module.kind === 'radial') {
    return (
      <div className="graph-radials">
        <DonutGauge value={metrics.confidence} accent="green" label="신뢰도" />
        <DonutGauge value={frame.health} accent="blue" label="건강도" />
      </div>
    );
  }

  if (module.kind === 'heatmap') {
    return (
      <div className="graph-heatmap">
        {frame.bars.flatMap((value, row) =>
          Array.from({ length: 4 }, (_, column) => (
            <motion.i
              key={`${row}-${column}`}
              className={`heat-${((value + row + column) % 5) + 1}`}
              animate={{ opacity: [0.42, 0.92, 0.54] }}
              transition={{ duration: 1.5 + column * 0.12, repeat: Infinity }}
            />
          )),
        )}
      </div>
    );
  }

  if (module.kind === 'stack') {
    return <BarStack points={metrics.incidents} />;
  }

  if (module.kind === 'network') {
    return (
      <div className="graph-network">
        {graphNetworkNodes.map((node, index) => (
          <motion.span
            key={node.id}
            className={`network-node network-${index + 1}`}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2 + index * 0.18, repeat: Infinity }}
          >
            {node.label}
          </motion.span>
        ))}
        <i className="network-line line-1" />
        <i className="network-line line-2" />
        <i className="network-line line-3" />
      </div>
    );
  }

  return (
    <div className="graph-timeline">
      {frame.events.map((event) => (
        <motion.article key={event.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <i className={`tone-dot tone-${event.tone}`} />
          <div>
            <strong>{event.title}</strong>
            <span>{event.detail}</span>
          </div>
        </motion.article>
      ))}
    </div>
  );
}

export function GraphLab({ frame, metrics }: { frame: RealtimeFrame; metrics: RuntimeMetrics }) {
  return (
    <section className="graph-lab">
      {graphModules.map((module, index) => (
        <motion.article
          className={`graph-module graph-${module.accent}`}
          key={module.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.04 }}
        >
          <header>
            <div>
              <span>{module.title}</span>
              <p>{module.description}</p>
            </div>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
          </header>
          <GraphModuleView module={module} frame={frame} metrics={metrics} />
        </motion.article>
      ))}
    </section>
  );
}
