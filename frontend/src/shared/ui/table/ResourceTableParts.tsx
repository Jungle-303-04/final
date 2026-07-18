import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import type {
  ResourceTableColumn,
  ResourceTableColumnPriority,
  ResourceTableSort,
  ResourceTableSortDirection,
} from "./ResourceTable";

function columnVisibility(priority: ResourceTableColumnPriority | undefined) {
  if (priority === "tertiary") return "hidden xl:table-cell";
  if (priority === "secondary") return "hidden md:table-cell";
  return "table-cell";
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction?: ResourceTableSortDirection;
}) {
  const Icon = !active
    ? ChevronsUpDown
    : direction === "desc"
      ? ArrowDown
      : ArrowUp;
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />;
}

export function HeaderRow<Row>({
  columns,
  onSort,
  sort,
}: {
  columns: readonly ResourceTableColumn<Row>[];
  onSort: (column: ResourceTableColumn<Row>) => void;
  sort: ResourceTableSort | undefined;
}) {
  return (
    <tr className="border-b border-border-subtle bg-card">
      {columns.map((column) => {
        const sortable = Boolean(column.sortValue);
        const active = sort?.columnId === column.id;
        return (
          <th
            aria-sort={active
              ? sort.direction === "asc" ? "ascending" : "descending"
              : sortable ? "none" : undefined}
            className={cn(
              "h-10 min-w-0 px-3 text-left text-label font-semibold text-caption-foreground",
              columnVisibility(column.priority),
              column.align === "end" && "text-right",
            )}
            key={column.id}
            scope="col"
          >
            {sortable ? (
              <button
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-sm outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring/60",
                  column.align === "end" && "ml-auto",
                )}
                onClick={() => onSort(column)}
                type="button"
              >
                <span className="truncate">{column.header}</span>
                <SortIcon active={active} direction={sort?.direction} />
              </button>
            ) : (
              <span className="block truncate">{column.header}</span>
            )}
          </th>
        );
      })}
    </tr>
  );
}

export function ResourceCells<Row>({
  columns,
  row,
}: {
  columns: readonly ResourceTableColumn<Row>[];
  row: Row;
}) {
  return columns.map((column) => (
    <td
      className={cn(
        "h-11 min-w-0 max-w-0 truncate px-3 py-2 align-middle text-body",
        columnVisibility(column.priority),
        column.align === "end" && "text-right font-mono tabular-nums",
      )}
      key={column.id}
    >
      {column.cell(row)}
    </td>
  ));
}
