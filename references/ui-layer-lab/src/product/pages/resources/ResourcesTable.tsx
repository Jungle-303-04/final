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
    <Table aria-label="리소스 목록" scrollAreaLabel="리소스 표 가로 스크롤">
      <TableCaption className="sr-only">
        현재 API 응답 범위에서 표시하는 Kubernetes 리소스 목록
      </TableCaption>
      <TableHeader>
        <TableRow>
          <SortableHead label="이름" onSort={() => updateSort("name")} sort={sort} sortKey="name" />
          <SortableHead label="Namespace" onSort={() => updateSort("namespace")} sort={sort} sortKey="namespace" />
          <SortableHead label="종류" onSort={() => updateSort("kind")} sort={sort} sortKey="kind" />
          <SortableHead label="상태" onSort={() => updateSort("status")} sort={sort} sortKey="status" />
          <SortableHead label="Health" onSort={() => updateSort("health")} sort={sort} sortKey="health" />
          <SortableHead label="관측" onSort={() => updateSort("observed")} sort={sort} sortKey="observed" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((item) => {
          const identity = identityOf(item);
          return (
            <TableRow key={item.id}>
              <TableCell className="max-w-72 font-medium">
                <Button
                  aria-label={`${item.name} 상세 열기`}
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
                  <span className="sr-only"> 상세 열기</span>
                </Button>
              </TableCell>
              <TableCell>{item.namespace ?? "—"}</TableCell>
              <TableCell>{item.kind}</TableCell>
              <TableCell>{item.status || "알 수 없음"}</TableCell>
              <TableCell>
                <StatusMark label={item.healthStatus || undefined} tone={item.health} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatTimestamp(item.observedAt)}
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

function formatTimestamp(value: string | null): string {
  if (!value) return "미관측";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function isButton(value: HTMLButtonElement | undefined): value is HTMLButtonElement {
  return value !== undefined;
}
