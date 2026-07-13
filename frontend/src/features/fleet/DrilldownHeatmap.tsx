import { type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const MotionButton = motion.create(Button);

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
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-w-0 px-0 py-0 text-label font-semibold text-brand hover:text-brand-hover"
                  onClick={item.onClick}
                >
                  {item.label}
                </Button>
              )}
            </span>
          );
        })}
      </nav>

      {loading ? (
        <div className="grid min-h-56 grid-cols-1 gap-2 sm:grid-cols-6 xl:grid-cols-12">
          {Array.from({ length: 8 }).map((_, index) => (
            <Card
              key={index}
              size="sm"
              className={cn(
                'min-h-24 rounded-panel border border-border bg-raised py-0 ring-0',
                index < 2 ? 'sm:col-span-3 xl:col-span-3' : 'sm:col-span-2 xl:col-span-2',
              )}
            >
              <CardContent className="grid gap-3 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>히트맵 조회 실패</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
          {onRetry && (
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                다시 시도
              </Button>
            </AlertAction>
          )}
        </Alert>
      ) : tiles.length === 0 ? (
        empty ?? (
          <Alert>
            <AlertTitle>타일 없음</AlertTitle>
          </Alert>
        )
      ) : zoomContext ? (
        <motion.div
          layout={motionLayout}
          className="grid gap-3"
        >
          <Card size="sm" className="rounded-control border border-border bg-raised py-0 ring-0">
            <CardContent className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-3 py-2">
              <span className="grid min-w-0 gap-1">
                <span className="min-w-0 truncate text-body font-semibold text-text-primary">{zoomContext.label}</span>
                {zoomContext.meta && <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-caption text-text-secondary">{zoomContext.meta}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {zoomContext.badge}
                <HealthBadge health={zoomContext.health} />
              </span>
            </CardContent>
          </Card>
          <TileGrid
            tiles={tiles}
            max={max}
            onTileClick={onTileClick}
            motionLayout={motionLayout}
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
  presenceMode,
  compact = false,
}: {
  tiles: DrilldownTile[];
  max: number;
  onTileClick: (tile: DrilldownTile) => void;
  motionLayout: boolean;
  presenceMode: 'sync' | 'popLayout';
  compact?: boolean;
}) {
  return (
    <motion.div
      layout={motionLayout}
      className={cn(
        'grid grid-cols-1 gap-2',
        compact ? 'min-h-32 sm:grid-cols-6 xl:grid-cols-12' : 'min-h-48 sm:grid-cols-6 xl:grid-cols-12',
      )}
    >
      <AnimatePresence initial={false} mode={presenceMode}>
        {tiles.map((tile) => (
          <MotionButton
            key={tile.id}
            type="button"
            variant="outline"
            layout={motionLayout}
            exit={motionLayout ? { opacity: 0 } : undefined}
            className={cn(
              'group relative grid h-auto min-h-24 content-between overflow-hidden rounded-panel border bg-surface p-4 pl-5 text-left whitespace-normal shadow-soft transition-colors motion-reduce:transition-none hover:border-border-strong hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              healthBorderClass(tile.health),
              compact ? compactSizeClass(safeSize(tile.size), max) : sizeClass(safeSize(tile.size), max),
              tile.pulse && 'ring-1 ring-danger/60',
            )}
            onClick={() => onTileClick(tile)}
          >
            <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', healthBarClass(tile.health, tile.pulse))} />
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
          </MotionButton>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function HealthBadge({ health }: { health: DrilldownHealth }) {
  const key = healthKey(health);
  if (key === 'critical') return <Badge variant="destructive" className="border-danger/40 bg-danger/10 text-danger">위험</Badge>;
  if (key === 'warning') return <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">주의</Badge>;
  if (key === 'healthy') return <Badge variant="outline" className="border-success/40 bg-success/10 text-success">정상</Badge>;
  return <Badge variant="outline" className="border-border bg-raised text-text-muted">미확인</Badge>;
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
