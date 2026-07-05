import { motion } from 'motion/react';
import { Box, FileText, GitBranch, ListChecks, Settings, TerminalSquare } from 'lucide-react';
import { resourceStateLabels } from '../data/labels';
import type { ScreenPreview, ScreenPreviewKind } from '../types';

const kindIcons: Record<ScreenPreviewKind, typeof Box> = {
  overview: Box,
  table: ListChecks,
  detail: FileText,
  graph: GitBranch,
  terminal: TerminalSquare,
  form: FileText,
  marketplace: Box,
  settings: Settings,
};

function stateClassName(state?: string) {
  if (!state) return '';
  return `state-cell state-${state}`;
}

export function ScreenCatalog({ screens }: { screens: ScreenPreview[] }) {
  return (
    <section className="screen-catalog">
      {screens.map((screen, index) => {
        const Icon = kindIcons[screen.kind];
        return (
          <motion.article
            className={`screen-preview preview-${screen.accent}`}
            key={screen.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.025 }}
            whileHover={{ y: -5 }}
          >
            <header>
              <span>{screen.group}</span>
              <Icon size={16} />
            </header>
            <h3>{screen.title}</h3>
            <p>{screen.description}</p>
            <div className="preview-stat-row">
              {screen.stats.map((stat) => (
                <strong key={stat.label}>
                  <small>{stat.label}</small>
                  {stat.value}
                </strong>
              ))}
            </div>
            <div className={`preview-body preview-kind-${screen.kind}`}>
              {screen.rows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong className={stateClassName(row.state)}>{resourceStateLabels[row.state ?? ''] ?? row.value}</strong>
                </div>
              ))}
            </div>
          </motion.article>
        );
      })}
    </section>
  );
}
