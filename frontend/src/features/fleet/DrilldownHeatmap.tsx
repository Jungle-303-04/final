import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Badge, Button, EmptyState, Skeleton, cx } from '@/ui';
import { AnimatePresence, listItem, listStagger, transitions } from '@/ui/motion';

export type DrilldownHealth = 'healthy' | 'warning' | 'critical' | 'unknown' | string;

export interface DrilldownTile {
  id: string;
  label: string;
  size: number;
  health: DrilldownHealth;
  meta?: ReactNode;
  badge?: ReactNode;
  actionLabel?: string;
  pulse?: boolean;
}

export interface DrilldownCrumb {
  id: string;
  label: string;
  onClick?: () => void;
}

export interface DrilldownZoomContext {
  id: string;
  label: string;
  health: DrilldownHealth;
  meta?: ReactNode;
  badge?: ReactNode;
}

export function DrilldownHeatmap({
  tiles,
  onTileClick,
  breadcrumb,
  zoomContext,
  loading,
  error,
  empty,
  onRetry,
}: {
  tiles: DrilldownTile[];
  onTileClick: (tile: DrilldownTile) => void;
  breadcrumb: DrilldownCrumb[];
  zoomContext?: DrilldownZoomContext | null;
  loading?: boolean;
  error?: Error | null;
  empty?: ReactNode;
  onRetry?: () => void;
}) {
  const max = Math.max(1, ...tiles.map((tile) => safeSize(tile.size)));
  const reducedMotion = useReducedMotion();
  const motionLayout = !reducedMotion;
  const motionTransition = reducedMotion ? transitions.reduced : transitions.spring;
  const presenceMode = reducedMotion ? 'sync' : 'popLayout';
  return (
    <div className="grid gap-4">
      <nav aria-label="히트맵 경로" className="flex min-w-0 flex-wrap items-center gap-2 text-label text-text-muted">
        {breadcrumb.map((item, index) => {
          const last = index === breadcrumb.length - 1;
          return (
            <span key={item.id} className="inline-flex min-w-0 items-center gap-2">
              {index > 0 && <span>/</span>}
              {last || !item.onClick ? (
                <span className="min-w-0 truncate text-text-secondary">{item.label}</span>
              ) : (
                <button type="button" className="min-w-0 truncate font-semibold text-brand hover:text-brand-hover" onClick={item.onClick}>
                  {item.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {loading ? (
        <div className="grid min-h-56 grid-cols-1 gap-2 sm:grid-cols-6 xl:grid-cols-12">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className={cx('rounded-panel border border-border bg-raised p-4', index < 2 ? 'sm:col-span-3 xl:col-span-3' : 'sm:col-span-2 xl:col-span-2')}>
              <Skeleton lines={3} />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState title="히트맵 조회 실패" description={error.message} action={onRetry ? <Button size="sm" onClick={onRetry}>다시 시도</Button> : undefined} />
      ) : tiles.length === 0 ? (
        empty ?? <EmptyState title="타일 없음" />
      ) : zoomContext ? (
        <motion.div
          layout={motionLayout}
          transition={motionTransition}
          className="grid gap-3"
        >
          <span className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-raised px-3 py-2">
            <span className="grid min-w-0 gap-1">
              <span className="min-w-0 truncate text-body font-semibold text-text-primary">{zoomContext.label}</span>
              {zoomContext.meta && <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-caption text-text-secondary">{zoomContext.meta}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {zoomContext.badge}
              <HealthBadge health={zoomContext.health} />
            </span>
          </span>
          <TileGrid
            tiles={tiles}
            max={max}
            onTileClick={onTileClick}
            motionLayout={motionLayout}
            motionTransition={motionTransition}
            presenceMode={presenceMode}
            compact
          />
        </motion.div>
      ) : (
        <TileGrid
          tiles={tiles}
          max={max}
          onTileClick={onTileClick}
          motionLayout={motionLayout}
          motionTransition={motionTransition}
          presenceMode={presenceMode}
        />
      )}
    </div>
  );
}

function TileGrid({
  tiles,
  max,
  onTileClick,
  motionLayout,
  motionTransition,
  presenceMode,
  compact = false,
}: {
  tiles: DrilldownTile[];
  max: number;
  onTileClick: (tile: DrilldownTile) => void;
  motionLayout: boolean;
  motionTransition: typeof transitions.spring | typeof transitions.reduced;
  presenceMode: 'sync' | 'popLayout';
  compact?: boolean;
}) {
  return (
    <motion.div
      layout={motionLayout}
      variants={motionLayout ? listStagger : undefined}
      initial={motionLayout ? 'initial' : false}
      animate={motionLayout ? 'animate' : undefined}
      className={cx(
        'grid grid-cols-1 gap-2',
        compact ? 'min-h-32 sm:grid-cols-6 xl:grid-cols-12' : 'min-h-48 sm:grid-cols-6 xl:grid-cols-12',
      )}
    >
      <AnimatePresence mode={presenceMode}>
        {tiles.map((tile) => (
          <motion.button
            key={tile.id}
            type="button"
            layout={motionLayout}
            variants={motionLayout ? listItem : undefined}
            transition={motionTransition}
            className={cx(
              'group relative grid min-h-24 content-between overflow-hidden rounded-panel border bg-surface p-4 pl-5 text-left shadow-soft transition-colors motion-reduce:transition-none hover:border-border-strong hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              healthBorderClass(tile.health),
              compact ? compactSizeClass(safeSize(tile.size), max) : sizeClass(safeSize(tile.size), max),
              tile.pulse && 'ring-1 ring-danger/60',
            )}
            onClick={() => onTileClick(tile)}
          >
            <span aria-hidden className={cx('absolute inset-y-0 left-0 w-1', healthBarClass(tile.health, tile.pulse))} />
            <span className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 truncate text-body font-semibold text-text-primary">{tile.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {tile.badge}
                <HealthBadge health={tile.health} />
              </span>
            </span>
            <span className="mt-3 grid gap-2">
              {tile.meta && <span className="grid gap-1.5 text-caption text-text-secondary">{tile.meta}</span>}
              {tile.actionLabel && (
                <span className="inline-flex w-fit items-center rounded-control border border-border bg-bg px-2 py-1 text-caption font-semibold text-text-secondary transition-colors group-hover:border-brand/40 group-hover:text-brand">
                  {tile.actionLabel}
                </span>
              )}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function HealthBadge({ health }: { health: DrilldownHealth }) {
  const key = healthKey(health);
  if (key === 'critical') return <Badge tone="danger">위험</Badge>;
  if (key === 'warning') return <Badge tone="warning">주의</Badge>;
  if (key === 'healthy') return <Badge tone="success">정상</Badge>;
  return <Badge>미확인</Badge>;
}

function safeSize(size: number) {
  return Number.isFinite(size) && size > 0 ? size : 1;
}

function healthKey(health: DrilldownHealth) {
  const key = String(health || 'unknown').toLowerCase();
  if (['critical', 'danger', 'failed', 'error', 'notready', 'crashloopbackoff'].includes(key)) return 'critical';
  if (['warning', 'warn', 'pending', 'stale', 'degraded', 'unknown'].includes(key)) return key === 'unknown' ? 'unknown' : 'warning';
  if (['healthy', 'ok', 'ready', 'running', 'connected', 'online'].includes(key)) return 'healthy';
  return 'unknown';
}

function healthBorderClass(health: DrilldownHealth) {
  const key = healthKey(health);
  if (key === 'critical') return 'border-danger/50';
  if (key === 'warning') return 'border-warning/50';
  return 'border-border';
}

function healthBarClass(health: DrilldownHealth, pulse?: boolean) {
  if (pulse) return 'bg-danger';
  const key = healthKey(health);
  if (key === 'critical') return 'bg-danger';
  if (key === 'warning') return 'bg-warning';
  if (key === 'healthy') return 'bg-success';
  return 'bg-raised';
}

function sizeClass(size: number, max: number) {
  const ratio = size / max;
  if (ratio >= 0.72) return 'sm:col-span-3 xl:col-span-3 min-h-32';
  if (ratio >= 0.38) return 'sm:col-span-3 xl:col-span-3 min-h-28';
  if (ratio >= 0.18) return 'sm:col-span-2 xl:col-span-3 min-h-24';
  return 'sm:col-span-2 xl:col-span-2 min-h-24';
}

function compactSizeClass(size: number, max: number) {
  const ratio = size / max;
  if (ratio >= 0.72) return 'sm:col-span-3 xl:col-span-4 min-h-28';
  if (ratio >= 0.38) return 'sm:col-span-3 xl:col-span-3 min-h-24';
  if (ratio >= 0.18) return 'sm:col-span-2 xl:col-span-3 min-h-24';
  return 'sm:col-span-2 xl:col-span-2 min-h-24';
}
