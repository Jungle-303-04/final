import type { ReactNode } from 'react';
import { Badge, Button, CodeBlock, cx } from '@/ui';
import { referenceSources, sourceIcon, statusMeta } from '../data';
import type { JobStatus, SourceId } from '../types';

export function ModuleFrame({
  title,
  summary,
  sources,
  actions,
  children,
}: {
  title: string;
  summary: string;
  sources: SourceId[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4 overflow-hidden rounded-panel border border-border bg-surface p-4 shadow-soft">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-title font-semibold text-primary">{title}</h2>
          <p className="mt-1 max-w-3xl text-body text-secondary">{summary}</p>
          <SourcePills ids={sources} className="mt-3" />
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function SourcePills({ ids, className }: { ids: SourceId[]; className?: string }) {
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      {ids.map((id) => {
        const source = referenceSources.find((item) => item.id === id);
        if (!source) return null;
        return (
          <a
            key={id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-2 rounded-control border border-border bg-bg px-2.5 py-1 text-caption font-semibold text-secondary transition-colors hover:border-border-strong hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {sourceIcon[id]}
            <span className="min-w-0 truncate">{source.name}</span>
          </a>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: JobStatus; label?: string }) {
  const meta = statusMeta[status];
  return (
    <Badge tone={meta.tone}>
      <span className="inline-flex items-center gap-1">
        {meta.icon}
        <span>{label ?? meta.label}</span>
      </span>
    </Badge>
  );
}

export function ProgressMeter({ value, className }: { value: number; className?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-raised', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeValue)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-standard" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export function TerminalBlock({ title = 'Log output', lines }: { title?: string; lines: string[] }) {
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-[#090b10] text-[#d9dee8] shadow-soft">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-3 py-2">
        <span className="text-caption font-semibold text-white/70">{title}</span>
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
      </div>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-caption leading-5"><code>{lines.join('\n')}</code></pre>
    </div>
  );
}

export function ReferenceCode({ path, notes }: { path: string; notes: string[] }) {
  return (
    <div className="grid gap-3 rounded-panel border border-border bg-bg p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label font-semibold text-secondary">재사용 위치</p>
          <p className="mt-1 truncate font-mono text-caption text-muted">{path}</p>
        </div>
        <Button size="sm" onClick={() => navigator.clipboard.writeText(path)}>경로 복사</Button>
      </div>
      <CodeBlock label="notes" code={notes.map((item) => `- ${item}`).join('\n')} />
    </div>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-control border border-border bg-raised px-1.5 font-mono text-caption font-semibold text-secondary shadow-soft">
      {children}
    </kbd>
  );
}
