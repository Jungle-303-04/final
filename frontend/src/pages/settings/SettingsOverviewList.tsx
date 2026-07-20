import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Surface } from "../../shared/ui/Surface";

export interface SettingsOverviewItem {
  description: string;
  icon: LucideIcon;
  id: string;
  onOpen(): void;
  title: string;
  value: ReactNode;
}

export function SettingsOverviewList({
  items,
  label,
}: {
  items: readonly SettingsOverviewItem[];
  label: string;
}) {
  return (
    <Surface aria-label={label} className="min-w-0 overflow-hidden rounded-card">
      <div className="divide-y divide-border-subtle">
        {items.map((item) => (
          <SettingsOverviewRow item={item} key={item.id} />
        ))}
      </div>
    </Surface>
  );
}

function SettingsOverviewRow({ item }: { item: SettingsOverviewItem }) {
  const Icon = item.icon;
  return (
    <button
      className="group grid min-h-[4.75rem] w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(7rem,auto)_auto] items-center gap-3 px-4 py-3 text-left transition-[background-color] duration-(--motion-micro) hover:bg-muted/35 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40 motion-reduce:transition-none"
      onClick={item.onOpen}
      type="button"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors duration-(--motion-micro) group-hover:bg-tint-blue-bg group-hover:text-tint-blue-fg motion-reduce:transition-none">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <strong className="truncate text-body-strong font-semibold" title={item.title}>{item.title}</strong>
        <span className="truncate text-label text-caption-foreground" title={item.description}>{item.description}</span>
      </span>
      <span className="min-w-0 truncate text-right text-label-2 font-medium text-foreground" title={typeof item.value === "string" ? item.value : undefined}>
        {item.value}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-micro) group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </button>
  );
}
