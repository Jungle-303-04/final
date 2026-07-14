import { useRef, useState, useMemo, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Input } from "./primitives/input";
import {
  activeSearchModifier,
  DEFAULT_SEARCH_ALIASES,
  filterSearchModifierOptions,
  type SearchModifier,
} from "./searchPillInputModel";

export type { SearchModifier } from "./searchPillInputModel";

export interface SearchPillInputProps {
  /** Free-text portion (everything that isn't a committed modifier pill). */
  text: string;
  /** Committed modifier pills. */
  pills: SearchModifier[];
  onChange: (next: { text: string; pills: SearchModifier[] }) => void;
  /** Keys the control doesn't consume are forwarded (result nav: arrows/enter/etc). */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onFocus?: () => void;
  placeholder?: string;
  /** Known values per CANONICAL modifier key for autocomplete (filtered locally). */
  modifierOptions?: Record<string, string[]>;
  /** Alias→canonical map; defaults to the k8s search parser's set. */
  aliases?: Record<string, string>;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /** Applied to the input container (host owns the box chrome: height, bg, border). */
  className?: string;
  /** Applied to the `<input>` itself (host owns text size: e.g. a hero variant). */
  inputClassName?: string;
  "aria-label"?: string;
  getRemovePillLabel: (pill: SearchModifier) => string;
  /** Fires when the modifier autocomplete opens/closes, so the host can suppress
      its own results dropdown while a modifier is being completed. */
  onSuggestingChange?: (suggesting: boolean) => void;
}

function highlightPartial(text: string, partial: string): React.ReactNode {
  if (!partial) return text;
  const i = text.toLowerCase().indexOf(partial.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="font-semibold text-[var(--primary)]">
        {text.slice(i, i + partial.length)}
      </span>
      {text.slice(i + partial.length)}
    </>
  );
}

export function SearchPillInput({
  text,
  pills,
  onChange,
  onKeyDown,
  onFocus,
  placeholder,
  modifierOptions,
  aliases = DEFAULT_SEARCH_ALIASES,
  inputRef: inputRefProp,
  leftSlot,
  rightSlot,
  className,
  inputClassName,
  getRemovePillLabel,
  onSuggestingChange,
  ...rest
}: SearchPillInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? internalRef;
  const [sel, setSel] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const mod = useMemo(
    () => activeSearchModifier(text, aliases),
    [text, aliases],
  );
  const filtered = useMemo(
    () => filterSearchModifierOptions(mod, modifierOptions),
    [mod, modifierOptions],
  );

  const suggesting = !dismissed && filtered.length > 0;

  useEffect(() => {
    onSuggestingChange?.(suggesting);
  }, [suggesting, onSuggestingChange]);

  const commitPill = (key: string, value: string, before: string) => {
    onChange({ pills: [...pills, { key, value }], text: before });
    setDismissed(false);
  };

  const removePill = (idx: number) => {
    onChange({ pills: pills.filter((_, i) => i !== idx), text });
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggesting) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const option = filtered[Math.min(sel, filtered.length - 1)];
        if (mod && option) {
          e.preventDefault();
          commitPill(mod.canon, option, mod.before);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === " " && mod && mod.partial.length > 0) {
      e.preventDefault();
      commitPill(mod.canon, mod.partial, mod.before);
      return;
    }
    if (e.key === "Backspace" && text === "" && pills.length > 0) {
      e.preventDefault();
      const last = pills[pills.length - 1];
      onChange({
        pills: pills.slice(0, -1),
        text: `${last.key}:${last.value}`,
      });
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative min-w-0">
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5 overflow-x-auto",
          className,
        )}
        data-slot="search-pill-input"
        onClick={() => inputRef.current?.focus()}
      >
      {leftSlot}
      {pills.map((p, i) => (
        <span
          key={`${p.key}:${p.value}:${i}`}
          className="inline-flex items-center gap-1 shrink-0 rounded-md bg-popover border border-border/60 pl-1.5 pr-1 py-0.5 text-xs whitespace-nowrap"
        >
          <span className="text-muted-foreground/75">{p.key}:</span>
          <span
            className="max-w-[16ch] truncate font-medium text-foreground"
            title={p.value}
          >
            {p.value}
          </span>
          <button
            type="button"
            tabIndex={-1}
            aria-label={getRemovePillLabel(p)}
            onMouseDown={(e) => {
              e.preventDefault();
              removePill(i);
            }}
            className="text-muted-foreground/75 hover:text-foreground rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          setDismissed(false);
          setSel(0);
          onChange({ text: e.target.value, pills });
        }}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        placeholder={pills.length ? "" : placeholder}
        aria-label={rest["aria-label"]}
        className={cn(
          "h-auto min-w-32 flex-1 border-0 bg-transparent px-0 py-0 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent",
          inputClassName ?? "text-sm",
        )}
      />
        {rightSlot}
      </div>
      {suggesting && mod ? (
        <div className="absolute left-0 top-full z-[130] mt-1 w-70 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/75">
              {mod.canon}
            </div>
            <div className="max-h-56 overflow-y-auto pb-1">
              {filtered.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    commitPill(mod.canon, opt, mod.before);
                  }}
                  onMouseMove={() => setSel(i)}
                  className={cn(
                    "w-full truncate px-2.5 py-1 text-left text-sm",
                    i === sel
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent/60",
                  )}
                >
                  {highlightPartial(opt, mod.partial)}
                </button>
              ))}
            </div>
        </div>
      ) : null}
    </div>
  );
}
