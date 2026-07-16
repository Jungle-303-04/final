import { SearchIcon, XIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";

interface MultiSelectPickerLabels {
  clearAll: string;
  clearVisible: (count: number) => string;
  done: string;
  noMatches: string;
  selectAll: string;
  selectVisible: (count: number) => string;
  selected: (count: number) => string;
}

interface MultiSelectPickerProps {
  clearAllAriaLabel: string;
  clearAllDisabled?: boolean;
  items: readonly string[];
  labels: MultiSelectPickerLabels;
  noItemsLabel: string;
  onClearAll: () => void;
  onDone: () => void;
  onSearchChange: (value: string) => void;
  onSelectionChange: (next: Set<string>) => void;
  renderItemMeta?: (item: string) => ReactNode;
  search: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchThreshold?: number;
  selected: ReadonlySet<string>;
  summaryEmptyLabel: string;
}

function MultiSelectPicker({
  clearAllAriaLabel,
  clearAllDisabled = false,
  items,
  labels,
  noItemsLabel,
  onClearAll,
  onDone,
  onSearchChange,
  onSelectionChange,
  renderItemMeta,
  search,
  searchLabel,
  searchPlaceholder,
  searchThreshold = 6,
  selected,
  summaryEmptyLabel,
}: MultiSelectPickerProps) {
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((item) => item.toLocaleLowerCase().includes(query));
  }, [items, search]);
  const visibleSelectedCount = filteredItems.reduce(
    (count, item) => count + Number(selected.has(item)),
    0,
  );
  const allVisibleSelected = filteredItems.length > 0 && visibleSelectedCount === filteredItems.length;

  const toggle = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onSelectionChange(next);
  };

  const updateVisibleSelection = (nextSelected: boolean) => {
    const next = new Set(selected);
    for (const item of filteredItems) {
      if (nextSelected) next.add(item);
      else next.delete(item);
    }
    onSelectionChange(next);
  };

  const bulkActionLabel = allVisibleSelected
    ? labels.clearVisible(filteredItems.length)
    : search.trim()
      ? labels.selectVisible(filteredItems.length)
      : labels.selectAll;

  return (
    <div className="grid min-w-0" data-slot="multi-select-picker">
      {items.length > searchThreshold ? (
        <div className="flex items-center gap-2 border-b px-2 py-1.5" data-slot="multi-select-picker-search">
          <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            aria-label={searchLabel}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={search}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5 text-xs text-muted-foreground">
        <button
          aria-label={clearAllAriaLabel}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          disabled={clearAllDisabled}
          onClick={onClearAll}
          type="button"
        >
          <XIcon aria-hidden="true" className="size-3" />
          {labels.clearAll}
        </button>
        <button
          className="rounded px-1.5 py-0.5 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          disabled={filteredItems.length === 0}
          onClick={() => updateVisibleSelection(!allVisibleSelected)}
          type="button"
        >
          {bulkActionLabel}
        </button>
      </div>

      <ul className="max-h-80 overflow-y-auto py-1" data-slot="multi-select-picker-options">
        {filteredItems.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            {search.trim() ? labels.noMatches : noItemsLabel}
          </li>
        ) : null}
        {filteredItems.map((item) => (
          <li key={item}>
            <label className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
              <span className="flex min-w-0 items-center gap-2">
                <input
                  checked={selected.has(item)}
                  className="shrink-0 accent-current"
                  onChange={() => toggle(item)}
                  type="checkbox"
                />
                <span className="truncate">{item}</span>
              </span>
              {renderItemMeta?.(item)}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-[0.6875rem] text-muted-foreground">
        <span>{selected.size === 0 ? summaryEmptyLabel : labels.selected(selected.size)}</span>
        <button
          className="rounded bg-muted px-2 py-0.5 text-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onDone}
          type="button"
        >
          {labels.done}
        </button>
      </div>
    </div>
  );
}

export { MultiSelectPicker };
export type { MultiSelectPickerLabels, MultiSelectPickerProps };
