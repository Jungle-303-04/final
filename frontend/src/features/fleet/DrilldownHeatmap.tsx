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
      <nav aria-label="히트맵 경로" className="flex min-w-0 flex-wrap items-center gap-2 text-label text-muted">
        {breadcrumb.map((item, index) => {
          const last = index === breadcrumb.length - 1;
          return (
            <span key={item.id} className="inline-flex min-w-0 items-center gap-2">
              {index > 0 && <span>/</span>}
              {last || !item.onClick ? (
                <span className="min-w-0 truncate text-secondary">{item.label}</span>
              ) : (
                <button type="button" className="min-w-0 truncate font-semibold text-accent hover:text-accent-hover" onClick={item.onClick}>
                  {item.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {loading ? (
        <div className="grid min-h-64 grid-cols-1 gap-2 sm:grid-cols-6 xl:grid-cols-12">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className={cx('rounded-panel border border-border bg-raised p-4', index < 2 ? 'sm:col-span-3 xl:col-span-4' : 'sm:col-span-3 xl:col-span-2')}>
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
          layoutId={motionLayout ? `heatmap-${zoomContext.id}` : undefined}
          transition={motionTransition}
          className={cx('grid min-h-64 gap-4 rounded-panel border p-4', tileClass(zoomContext.health))}
        >
          <span className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <span className="grid min-w-0 gap-1">
              <span className="min-w-0 truncate text-title font-semibold text-primary">{zoomContext.label}</span>
              {zoomContext.meta && <span className="grid gap-2 text-body text-secondary">{zoomContext.meta}</span>}
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
      className={cx('grid grid-cols-1 gap-2 sm:grid-cols-6 xl:grid-cols-12', compact ? 'min-h-48' : 'min-h-64')}
    >
      <AnimatePresence mode={presenceMode}>
        {tiles.map((tile) => (
          <motion.button
            key={tile.id}
            type="button"
            layout={motionLayout}
            layoutId={motionLayout ? `heatmap-${tile.id}` : undefined}
            variants={motionLayout ? listItem : undefined}
            transition={motionTransition}
            className={cx(
              'group grid min-h-24 content-between rounded-panel border p-4 text-left transition-colors motion-reduce:transition-none hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              tileClass(tile.health),
              sizeClass(safeSize(tile.size), max),
              tile.pulse && 'border-danger ring-2 ring-danger/50 motion-safe:animate-pulse',
            )}
            onClick={() => onTileClick(tile)}
          >
            <span className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 truncate text-title font-semibold text-primary">{tile.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {tile.badge}
                <HealthBadge health={tile.health} />
              </span>
            </span>
            <span className="mt-4 grid gap-3">
              {tile.meta && <span className="grid gap-2 text-body text-secondary">{tile.meta}</span>}
              {tile.actionLabel && (
                <span className="inline-flex w-fit items-center rounded-control border border-accent/40 bg-accent/10 px-2 py-1 text-label font-semibold text-accent transition-colors group-hover:bg-accent/15">
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

function tileClass(health: DrilldownHealth) {
  const key = healthKey(health);
  if (key === 'critical') return 'border-danger/50 bg-danger/10';
  if (key === 'warning') return 'border-warning/50 bg-warning/10';
  if (key === 'healthy') return 'border-success/50 bg-success/10';
  return 'border-border bg-bg';
}

function sizeClass(size: number, max: number) {
  const ratio = size / max;
  if (ratio >= 0.72) return 'sm:col-span-3 xl:col-span-4 min-h-36';
  if (ratio >= 0.38) return 'sm:col-span-3 xl:col-span-3 min-h-32';
  if (ratio >= 0.18) return 'sm:col-span-2 xl:col-span-3 min-h-28';
  return 'sm:col-span-2 xl:col-span-2 min-h-24';
}
