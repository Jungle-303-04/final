import {
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { TableVirtuoso, type TableComponents } from "react-virtuoso";

import { cn } from "@/shared/lib/cn";
import { HeaderRow, ResourceCells } from "./ResourceTableParts";

export type ResourceTableColumnPriority = "primary" | "secondary" | "tertiary";
export type ResourceTableSortDirection = "asc" | "desc";

export interface ResourceTableColumn<Row> {
  align?: "end" | "start";
  cell: (row: Row) => ReactNode;
  header: ReactNode;
  id: string;
  priority?: ResourceTableColumnPriority;
  sortValue?: (row: Row) => null | number | string | undefined;
}

export interface ResourceTableSort {
  columnId: string;
  direction: ResourceTableSortDirection;
}

export interface ResourceTableProps<Row> {
  ariaLabel: string;
  caption?: string;
  className?: string;
  columns: readonly ResourceTableColumn<Row>[];
  defaultCompare?: (left: Row, right: Row) => number;
  emptyState: ReactNode;
  getRowKey: (row: Row) => string;
  getRowLabel?: (row: Row) => string;
  initialSort?: ResourceTableSort;
  onRowActivate?: (row: Row) => void;
  rows: readonly Row[];
  virtualizeAbove?: number;
}

const DEFAULT_VIRTUALIZE_ABOVE = 200;

function compareValues(
  left: null | number | string | undefined,
  right: null | number | string | undefined,
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortRows<Row>(
  rows: readonly Row[],
  columns: readonly ResourceTableColumn<Row>[],
  sort: ResourceTableSort | undefined,
  defaultCompare: ((left: Row, right: Row) => number) | undefined,
) {
  const indexedRows = rows.map((row, index) => ({ index, row }));
  const column = sort
    ? columns.find((candidate) => candidate.id === sort.columnId)
    : undefined;

  return indexedRows
    .sort((left, right) => {
      const compared = column?.sortValue && sort
        ? compareValues(
            column.sortValue(left.row),
            column.sortValue(right.row),
          ) * (sort.direction === "asc" ? 1 : -1)
        : (defaultCompare?.(left.row, right.row) ?? 0);
      return compared || left.index - right.index;
    })
    .map(({ row }) => row);
}

function activateFromKeyboard<Row>(
  event: KeyboardEvent,
  row: Row,
  onRowActivate: ((row: Row) => void) | undefined,
) {
  if (!onRowActivate || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  onRowActivate(row);
}

export function ResourceTable<Row>({
  ariaLabel,
  caption,
  className,
  columns,
  defaultCompare,
  emptyState,
  getRowKey,
  getRowLabel,
  initialSort,
  onRowActivate,
  rows,
  virtualizeAbove = DEFAULT_VIRTUALIZE_ABOVE,
}: ResourceTableProps<Row>) {
  const [sort, setSort] = useState<ResourceTableSort | undefined>(initialSort);
  const orderedRows = useMemo(
    () => sortRows(rows, columns, sort, defaultCompare),
    [columns, defaultCompare, rows, sort],
  );
  const virtualized = orderedRows.length > virtualizeAbove;

  function updateSort(column: ResourceTableColumn<Row>) {
    if (!column.sortValue) return;
    setSort((current) => ({
      columnId: column.id,
      direction: current?.columnId === column.id && current.direction === "asc"
        ? "desc"
        : "asc",
    }));
  }

  const virtualComponents = useMemo<TableComponents<Row>>(() => ({
    Table: (props) => (
      <table
        {...props}
        aria-label={ariaLabel}
        className="w-full table-fixed border-separate border-spacing-0"
      />
    ),
    TableBody: (props) => <tbody {...props} />,
    TableHead: (props) => <thead {...props} className="z-10" />,
    TableRow: ({ item, ...props }) => (
      <tr
        {...props}
        aria-label={getRowLabel?.(item)}
        className={cn(
          "border-b border-border-subtle bg-card",
          "transition-colors duration-(--motion-instant) ease-(--ease-soft)",
          onRowActivate &&
            "cursor-pointer outline-none hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
        )}
        onClick={onRowActivate ? () => onRowActivate(item) : undefined}
        onKeyDown={onRowActivate
          ? (event) => activateFromKeyboard(event, item, onRowActivate)
          : undefined}
        tabIndex={onRowActivate ? 0 : undefined}
      />
    ),
  }), [ariaLabel, getRowLabel, onRowActivate]);

  if (orderedRows.length === 0) {
    return (
      <section
        aria-label={ariaLabel}
        className={cn(
          "grid min-h-48 place-items-center rounded-card border border-border-subtle bg-card p-6",
          className,
        )}
      >
        {emptyState}
      </section>
    );
  }

  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "min-h-0 overflow-hidden rounded-card border border-border-subtle bg-card",
        className,
      )}
      data-slot="resource-table"
      data-virtualized={virtualized || undefined}
    >
      {virtualized ? (
        <TableVirtuoso
          className="h-full min-h-72 [scrollbar-gutter:stable]"
          components={virtualComponents}
          computeItemKey={(_index, row) => getRowKey(row)}
          data={orderedRows}
          fixedHeaderContent={() => (
            <HeaderRow columns={columns} onSort={updateSort} sort={sort} />
          )}
          fixedItemHeight={44}
          itemContent={(_index, row) => (
            <ResourceCells columns={columns} row={row} />
          )}
        />
      ) : (
        <div className="h-full min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
          <table
            aria-label={ariaLabel}
            className="w-full table-fixed border-separate border-spacing-0"
          >
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead className="sticky top-0 z-10">
              <HeaderRow columns={columns} onSort={updateSort} sort={sort} />
            </thead>
            <tbody>
              {orderedRows.map((row) => (
                <tr
                  aria-label={getRowLabel?.(row)}
                  className={cn(
                    "border-b border-border-subtle bg-card",
                    "transition-colors duration-(--motion-instant) ease-(--ease-soft)",
                    onRowActivate &&
                      "cursor-pointer outline-none hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                  )}
                  key={getRowKey(row)}
                  onClick={onRowActivate
                    ? () => onRowActivate(row)
                    : undefined}
                  onKeyDown={onRowActivate
                    ? (event) => activateFromKeyboard(event, row, onRowActivate)
                    : undefined}
                  tabIndex={onRowActivate ? 0 : undefined}
                >
                  <ResourceCells columns={columns} row={row} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
