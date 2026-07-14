import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  isProductContextShortcutId,
  PRODUCT_SHORTCUT_EVENT,
  type ProductShortcutEventDetail,
} from "../../app/shortcutRegistry";
import type {
  ResourceIdentity,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Button } from "../../shared/ui/primitives/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";

type SortKey = "name" | "namespace" | "kind" | "status" | "health" | "observed";

export function ResourcesTable({
  items,
  onOpen,
  registerRowButton,
}: {
  items: ResourceSummary[];
  onOpen: (identity: ResourceIdentity) => void;
  registerRowButton: (identity: ResourceIdentity, element: HTMLButtonElement | null) => void;
}) {
  const { formatDate, t } = useI18n();
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "name",
    direction: "asc",
  });
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const sorted = useMemo(() => [...items].sort((left, right) => {
    const order = sortValue(left, sort.key).localeCompare(sortValue(right, sort.key));
    return sort.direction === "asc" ? order : -order;
  }), [items, sort]);

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const detail = (event as CustomEvent<ProductShortcutEventDetail>).detail;
      if (!detail || !isProductContextShortcutId(detail.id)) return;
      const buttons = sorted.map((item) => rowButtons.current.get(item.id)).filter(isButton);
      if (buttons.length === 0) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (detail.id === "resources:next-row" || detail.id === "resources:previous-row") {
        const next = current < 0
          ? 0
          : Math.max(0, Math.min(
            buttons.length - 1,
            current + (detail.id === "resources:next-row" ? 1 : -1),
          ));
        buttons[next]?.focus();
        return;
      }
      if (detail.id === "resources:first-row") {
        buttons[0]?.focus();
        return;
      }
      if (detail.id === "resources:last-row") {
        buttons[buttons.length - 1]?.focus();
        return;
      }
      if (detail.id === "resources:open-row") {
        (current >= 0 ? buttons[current] : buttons[0])?.click();
      }
    };
    window.addEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
    return () => window.removeEventListener(PRODUCT_SHORTCUT_EVENT, handleShortcut);
  }, [sorted]);

  function updateSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  return (
    <Table
      aria-label={t("resources.table.aria")}
      scrollAreaLabel={t("resources.table.scrollArea")}
    >
      <TableCaption className="sr-only">
        {t("resources.table.caption")}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <SortableHead label={t("resources.table.name")} onSort={() => updateSort("name")} sort={sort} sortKey="name" />
          <SortableHead label={t("resources.table.namespace")} onSort={() => updateSort("namespace")} sort={sort} sortKey="namespace" />
          <SortableHead label={t("resources.table.kind")} onSort={() => updateSort("kind")} sort={sort} sortKey="kind" />
          <SortableHead label={t("resources.table.status")} onSort={() => updateSort("status")} sort={sort} sortKey="status" />
          <SortableHead label={t("resources.table.health")} onSort={() => updateSort("health")} sort={sort} sortKey="health" />
          <TableHead>{t("resources.table.trend")}</TableHead>
          <SortableHead label={t("resources.table.observedAt")} onSort={() => updateSort("observed")} sort={sort} sortKey="observed" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((item) => {
          const identity = identityOf(item);
          return (
            <TableRow key={item.id}>
              <TableCell className="max-w-72 font-medium">
                <Button
                  aria-label={t("resources.table.openDetail", { name: item.name })}
                  className="h-auto max-w-full justify-start px-0 text-left"
                  onClick={() => onOpen(identity)}
                  ref={(element) => {
                    if (element) rowButtons.current.set(item.id, element);
                    else rowButtons.current.delete(item.id);
                    registerRowButton(identity, element);
                  }}
                  type="button"
                  variant="link"
                >
                  <span className="truncate">{item.name}</span>
                  <span className="sr-only"> {t("resources.table.openDetail.sr")}</span>
                </Button>
              </TableCell>
              <TableCell>{item.namespace ?? "—"}</TableCell>
              <TableCell>{item.kind}</TableCell>
              <TableCell>{item.status || t("common.state.unknown")}</TableCell>
              <TableCell>
                <StatusMark label={item.healthStatus || undefined} tone={item.health} />
              </TableCell>
              <TableCell>
                <span
                  aria-label={t("resources.table.trendUnavailable")}
                  className="block h-6 w-24"
                  data-slot="resource-trend-unavailable"
                  role="img"
                />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatTimestamp(item.observedAt, formatDate, t("resources.table.unobserved"))}
              </TableCell>
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

function SortableHead({
  label,
  onSort,
  sort,
  sortKey,
}: {
  label: string;
  onSort: () => void;
  sort: { key: SortKey; direction: "asc" | "desc" };
  sortKey: SortKey;
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

function sortValue(item: ResourceSummary, key: SortKey): string {
  if (key === "name") return item.name;
  if (key === "namespace") return item.namespace ?? "";
  if (key === "kind") return item.kind;
  if (key === "status") return item.status;
  if (key === "health") return item.healthStatus;
  return item.observedAt ?? "";
}

function identityOf(item: ResourceSummary): ResourceIdentity {
  return {
    resourceType: item.resourceType,
    kind: item.kind,
    namespace: item.namespace,
    name: item.name,
  };
}

function formatTimestamp(
  value: string | null,
  formatDate: ReturnType<typeof useI18n>["formatDate"],
  unavailable: string,
): string {
  if (!value) return unavailable;
  return formatDate(new Date(value), {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function isButton(value: HTMLButtonElement | undefined): value is HTMLButtonElement {
  return value !== undefined;
}
