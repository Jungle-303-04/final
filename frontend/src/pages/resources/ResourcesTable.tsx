import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  isProductContextShortcutId,
  PRODUCT_SHORTCUT_EVENT,
  type ProductShortcutEventDetail,
} from "../../app/shortcutRegistry";
import type {
  ResourceIdentity,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { shortIdentity } from "../../shared/presentation/shortIdentity";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui/primitives/tooltip";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { ResourceTableSmartCell } from "./ResourceTableSmartCell";
import { ResourceSparkline } from "./ResourceSparkline";
import { useBottomDock } from "../../features/bottom-dock/BottomDockProvider";
import { logStreamTargetFromResource } from "../../features/log-stream/logStreamTarget";
import {
  resourceTableColumns,
  resourceTableSortValue,
  type ResourceTableColumnKey,
} from "./resourceTableModel";
import { cn } from "@/shared/lib/cn";

export function ResourcesTable({
  items,
  metricHistory,
  onOpen,
  registerRowButton,
}: {
  items: ResourceSummary[];
  metricHistory: ResourceMetricsHistoryFrame;
  onOpen: (identity: ResourceIdentity) => void;
  registerRowButton: (identity: ResourceIdentity, element: HTMLButtonElement | null) => void;
}) {
  const { t } = useI18n();
  const dock = useBottomDock();
  const columns = useMemo(() => resourceTableColumns(items), [items]);
  const metricSeries = useMemo(() => new Map(
    metricHistory.phase === "ready"
      ? metricHistory.data.series.map((series) => [series.resourceId, series] as const)
      : [],
  ), [metricHistory]);
  const [sort, setSort] = useState<{
    key: ResourceTableColumnKey;
    direction: "asc" | "desc";
  }>({ key: "name", direction: "asc" });
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const sorted = useMemo(() => [...items].sort((left, right) => {
    const order = compareSortValues(
      resourceTableSortValue(left, sort.key),
      resourceTableSortValue(right, sort.key),
    );
    return sort.direction === "asc" ? order : -order;
  }), [items, sort]);

  useRowShortcuts(sorted, rowButtons, dock.openLogs);

  function updateSort(key: ResourceTableColumnKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  return (
    <Table aria-label={t("resources.table.aria")} scrollAreaLabel={t("resources.table.scrollArea")}>
      <TableCaption className="sr-only">{t("resources.table.caption")}</TableCaption>
      <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
        <TableRow>
          {columns.map((column) => column.sortable ? (
            <SortableHead
              key={column.key}
              label={t(column.labelKey)}
              onSort={() => updateSort(column.key)}
              sort={sort}
              sortKey={column.key}
            />
          ) : (
            <TableHead key={column.key}>{t(column.labelKey)}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((item) => {
          const identity = identityOf(item);
          return (
            <TableRow key={item.id}>
              {columns.map((column) => (
                <TableCell className={column.key === "name" ? "max-w-72 font-medium" : undefined} key={column.key}>
                  {column.key === "name" ? (
                    <ResourceNameButton
                      identity={identity}
                      item={item}
                      onOpen={onOpen}
                      registerRowButton={registerRowButton}
                      rowButtons={rowButtons}
                    />
                  ) : column.key === "trend" ? (
                    <ResourceSparkline
                      identity={identity}
                      name={item.name}
                      onOpen={onOpen}
                      series={metricSeries.get(item.inventoryKey) ?? null}
                    />
                  ) : (
                    <ResourceTableSmartCell column={column.key} item={item} />
                  )}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function filterResourceRows(items: ResourceSummary[], search: string): ResourceSummary[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return items;
  return items.filter((item) => [
    item.name,
    item.namespace,
    item.kind,
    item.status,
    item.healthStatus,
  ].some((value) => value?.toLocaleLowerCase().includes(query)));
}

function useRowShortcuts(
  sorted: ResourceSummary[],
  rowButtons: RefObject<Map<string, HTMLButtonElement>>,
  openLogs: ReturnType<typeof useBottomDock>["openLogs"],
) {
  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const detail = (event as CustomEvent<ProductShortcutEventDetail>).detail;
      if (!detail || !isProductContextShortcutId(detail.id)) return;
      const buttons = sorted.map((item) => rowButtons.current.get(item.id)).filter(isButton);
      if (buttons.length === 0) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (detail.id === "resources:next-row" || detail.id === "resources:previous-row") {
        const next = current < 0 ? 0 : Math.max(0, Math.min(
          buttons.length - 1,
          current + (detail.id === "resources:next-row" ? 1 : -1),
        ));
        buttons[next]?.focus();
      } else if (detail.id === "resources:first-row") {
        buttons[0]?.focus();
      } else if (detail.id === "resources:last-row") {
        buttons[buttons.length - 1]?.focus();
      } else if (detail.id === "resources:open-row") {
        (current >= 0 ? buttons[current] : buttons[0])?.click();
      } else if (detail.id === "resources:open-logs") {
        const selected = current >= 0 ? sorted[current] : undefined;
        const target = selected ? logStreamTargetFromResource(selected) : null;
        if (target) openLogs(target);
      }
    };
    window.addEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
    return () => window.removeEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
  }, [openLogs, rowButtons, sorted]);
}

function SortableHead({
  label,
  onSort,
  sort,
  sortKey,
}: {
  label: string;
  onSort: () => void;
  sort: { key: ResourceTableColumnKey; direction: "asc" | "desc" };
  sortKey: ResourceTableColumnKey;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <Button className="-ml-2" onClick={onSort} size="sm" type="button" variant="ghost">
        {label}
        <Icon aria-hidden="true" data-icon="inline-end" />
      </Button>
    </TableHead>
  );
}

function ResourceNameButton({
  identity,
  item,
  onOpen,
  registerRowButton,
  rowButtons,
}: {
  identity: ResourceIdentity;
  item: ResourceSummary;
  onOpen: (identity: ResourceIdentity) => void;
  registerRowButton: (identity: ResourceIdentity, element: HTMLButtonElement | null) => void;
  rowButtons: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const { t } = useI18n();
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            aria-label={t("resources.table.openDetail", { name: item.name })}
            className={resourceNameButtonClassName(item)}
            onClick={() => onOpen(identity)}
            ref={(element) => {
              if (element) rowButtons.current.set(item.id, element);
              else rowButtons.current.delete(item.id);
              registerRowButton(identity, element);
            }}
            type="button"
            variant="link"
          />
        )}
      >
        <span className="truncate">{shortIdentity(item.name)}</span>
        <span className="sr-only"> {t("resources.table.openDetail.sr")}</span>
      </TooltipTrigger>
      <TooltipContent className="break-all" side="top">{item.name}</TooltipContent>
    </Tooltip>
  );
}

export function resourceNameButtonClassName(item: ResourceSummary): string {
  return cn(
    "h-auto max-w-full justify-start px-0 text-left",
    item.facts.type === "event" && [
      "text-resource-event-name no-underline",
      "hover:text-resource-event-name-hover hover:underline",
      "focus-visible:border-resource-event-name focus-visible:text-resource-event-name-hover",
      "focus-visible:underline focus-visible:ring-resource-event-name/40",
    ],
  );
}

function identityOf(item: ResourceSummary): ResourceIdentity {
  return {
    resourceType: item.resourceType,
    kind: item.kind,
    namespace: item.namespace,
    name: item.name,
  };
}

function isButton(value: HTMLButtonElement | undefined): value is HTMLButtonElement {
  return value !== undefined;
}

function compareSortValues(left: string | number, right: string | number): number {
  return typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right));
}
