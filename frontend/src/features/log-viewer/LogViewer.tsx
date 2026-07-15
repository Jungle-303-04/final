import {
  CaseSensitive,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Regex,
  Search,
  WrapText,
} from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import type { BottomDockLine } from "../bottom-dock/bottomDockState";
import {
  createLogSearch,
  detectLogLevel,
  parseStructuredLog,
  stringifyLogValue,
  type LogDisplayMode,
  type LogLevel,
} from "./logViewerModel";

const LEVELS: LogLevel[] = ["error", "warn", "info", "debug", "unknown"];

export function LogViewer({
  lines,
  received,
  targetName,
}: {
  lines: BottomDockLine[];
  received: number;
  targetName: string;
}) {
  const { t } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const virtuoso = useRef<VirtuosoHandle>(null);
  const previousReceived = useRef(received);
  const [query, setQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [mode, setMode] = useState<LogDisplayMode>("compact");
  const [wrap, setWrap] = useState(false);
  const [levels, setLevels] = useState<Set<LogLevel>>(() => new Set(LEVELS));
  const [following, setFollowing] = useState(true);
  const [pendingLines, setPendingLines] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const announcedNewLines = useThrottledLogAnnouncement(received, targetName);

  const search = useMemo(
    () => createLogSearch(query, isRegex, isCaseSensitive),
    [isCaseSensitive, isRegex, query],
  );
  const visibleLines = useMemo(() => lines.filter((line) =>
    levels.has(detectLogLevel(line.line)) && search.matches(line)), [levels, lines, search]);

  useEffect(() => {
    const added = Math.max(0, received - previousReceived.current);
    previousReceived.current = received;
    if (!following && added > 0) setPendingLines((count) => count + added);
  }, [following, received]);

  const moveToMatch = (direction: 1 | -1) => {
    if (!query || visibleLines.length === 0) return;
    const next = (currentMatch + direction + visibleLines.length) % visibleLines.length;
    setCurrentMatch(next);
    virtuoso.current?.scrollToIndex({
      index: next,
      align: "center",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  const resumeFollowing = () => {
    setFollowing(true);
    setPendingLines(0);
    if (visibleLines.length > 0) {
      virtuoso.current?.scrollToIndex({
        index: visibleLines.length - 1,
        align: "end",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }
  };

  const toggleLevel = (level: LogLevel) => {
    setCurrentMatch(0);
    setLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveToMatch(event.shiftKey ? -1 : 1);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setCurrentMatch(0);
    }
  };

  const copyLine = async (line: BottomDockLine) => {
    await writeClipboard(line.line);
    setCopiedId(line.id);
    window.setTimeout(() => setCopiedId((value) => value === line.id ? null : value), 1_200);
  };

  return (
    <section
      aria-label={t("shell.dock.logs", { name: targetName })}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <output
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        data-testid="log-announcer"
      >
        {announcedNewLines > 0 ? t("shell.dock.newLines", { count: announcedNewLines }) : ""}
      </output>
      <div
        className="flex h-10 shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-b bg-muted/30 px-2 overscroll-x-contain"
        data-testid="log-toolbar"
      >
        <div className="relative w-56 shrink-0">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-invalid={search.error ? true : undefined}
            aria-label={t("shell.dock.search")}
            className="h-7 pr-2 pl-7 font-sans text-xs"
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentMatch(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("shell.dock.searchPlaceholder")}
            value={query}
          />
        </div>
        <ToolbarToggle
          active={isRegex}
          label={t("shell.dock.regex")}
          onClick={() => {
            setIsRegex((value) => !value);
            setCurrentMatch(0);
          }}
        >
          <Regex aria-hidden="true" />
        </ToolbarToggle>
        <ToolbarToggle
          active={isCaseSensitive}
          label={t("shell.dock.caseSensitive")}
          onClick={() => {
            setIsCaseSensitive((value) => !value);
            setCurrentMatch(0);
          }}
        >
          <CaseSensitive aria-hidden="true" />
        </ToolbarToggle>
        {query ? (
          <div className="flex h-7 shrink-0 items-center rounded-lg border bg-background pl-2 text-[11px] text-muted-foreground">
            <span aria-live="polite">
              {search.error
                ? t("shell.dock.searchInvalid")
                : visibleLines.length > 0
                  ? t("shell.dock.searchMatches", {
                      current: currentMatch + 1,
                      count: visibleLines.length,
                    })
                  : t("shell.dock.searchNoMatches")}
            </span>
            <Button
              aria-label={t("shell.dock.previousMatch")}
              disabled={visibleLines.length === 0}
              onClick={() => moveToMatch(-1)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronUp aria-hidden="true" />
            </Button>
            <Button
              aria-label={t("shell.dock.nextMatch")}
              disabled={visibleLines.length === 0}
              onClick={() => moveToMatch(1)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
        {LEVELS.map((level) => (
          <Button
            aria-pressed={levels.has(level)}
            className={cn(
              "h-7 shrink-0 px-2 text-[11px]",
              levels.has(level) && levelTone(level),
            )}
            key={level}
            onClick={() => toggleLevel(level)}
            size="sm"
            type="button"
            variant={levels.has(level) ? "secondary" : "ghost"}
          >
            {t(`shell.dock.level.${level}`)}
          </Button>
        ))}
        <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
        <select
          aria-label={t("shell.dock.displayMode")}
          className="h-7 shrink-0 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setMode(event.target.value as LogDisplayMode)}
          value={mode}
        >
          <option value="compact">{t("shell.dock.mode.compact")}</option>
          <option value="expanded">{t("shell.dock.mode.expanded")}</option>
          <option value="raw">{t("shell.dock.mode.raw")}</option>
        </select>
        <ToolbarToggle active={wrap} label={t("shell.dock.wrap")} onClick={() => setWrap((value) => !value)}>
          <WrapText aria-hidden="true" />
        </ToolbarToggle>
        <Button
          aria-label={t("shell.dock.download")}
          onClick={() => downloadLogs(lines, targetName)}
          size="icon-sm"
          title={t("shell.dock.download")}
          type="button"
          variant="ghost"
        >
          <Download aria-hidden="true" />
        </Button>
      </div>

      {visibleLines.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-4 text-center font-sans text-sm text-muted-foreground">
          <p>{query || levels.size < LEVELS.length ? t("shell.dock.searchNoMatches") : t("shell.dock.empty")}</p>
        </div>
      ) : (
        <Virtuoso
          atBottomStateChange={(atBottom) => {
            setFollowing(atBottom);
            if (atBottom) setPendingLines(0);
          }}
          atBottomThreshold={40}
          className="min-h-0 flex-1 font-mono text-xs"
          computeItemKey={(_index, line) => line.id}
          data={visibleLines}
          followOutput={following}
          increaseViewportBy={240}
          initialTopMostItemIndex={visibleLines.length - 1}
          itemContent={(index, line) => (
            <LogLine
              active={Boolean(query) && index === currentMatch}
              copied={copiedId === line.id}
              line={line}
              mode={mode}
              onCopy={() => void copyLine(line)}
              query={isRegex ? "" : query}
              wrap={wrap}
            />
          )}
          ref={virtuoso}
        />
      )}

      {!following && pendingLines > 0 ? (
        <Button
          className="absolute right-4 bottom-4 rounded-full shadow-lg"
          onClick={resumeFollowing}
          size="sm"
          type="button"
        >
          {t("shell.dock.newLines", { count: pendingLines })}
        </Button>
      ) : null}
    </section>
  );
}

function useThrottledLogAnnouncement(received: number, scope: string): number {
  const activeScope = useRef(scope);
  const baseline = useRef(received);
  const latest = useRef(received);
  const timer = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState({ scope, count: 0 });

  useEffect(() => {
    if (activeScope.current !== scope) {
      activeScope.current = scope;
      baseline.current = received;
      latest.current = received;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      return;
    }
    latest.current = received;
    if (received <= baseline.current || timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setAnnouncement({
        scope: activeScope.current,
        count: Math.max(0, latest.current - baseline.current),
      });
    }, 1_000);
  }, [received, scope]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return announcement.scope === scope ? announcement.count : 0;
}

const LogLine = memo(function LogLine({
  active,
  copied,
  line,
  mode,
  onCopy,
  query,
  wrap,
}: {
  active: boolean;
  copied: boolean;
  line: BottomDockLine;
  mode: LogDisplayMode;
  onCopy: () => void;
  query: string;
  wrap: boolean;
}) {
  const { formatDate, t } = useI18n();
  const level = detectLogLevel(line.line);
  return (
    <div
      className={cn(
        "group grid min-w-max grid-cols-[auto_auto_minmax(20rem,1fr)_auto] items-start gap-x-2 border-l-2 border-b border-b-border/40 px-2 py-1.5 hover:bg-muted/35",
        levelBorder(level),
        active && "bg-accent/60 ring-1 ring-inset ring-ring/50",
        wrap && "min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto]",
      )}
      data-level={level}
    >
      <time className="select-none text-muted-foreground" dateTime={line.observedAt}>
        {formatTime(line.observedAt, formatDate)}
      </time>
      <span className="max-w-36 truncate text-muted-foreground" title={`${line.pod} / ${line.container}`}>
        {line.container || line.pod}
      </span>
      <code className={cn("min-w-0", wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")}>
        <StructuredContent line={line.line} mode={mode} query={query} />
        {line.lineTruncated ? (
          <Badge className="ml-2 align-middle" variant="outline">{t("shell.dock.truncated")}</Badge>
        ) : null}
      </code>
      <Button
        aria-label={copied ? t("shell.dock.copied") : t("shell.dock.copyLine")}
        className="-my-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        onClick={onCopy}
        size="icon-sm"
        title={copied ? t("shell.dock.copied") : t("shell.dock.copyLine")}
        type="button"
        variant="ghost"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
    </div>
  );
});

function StructuredContent({
  line,
  mode,
  query,
}: {
  line: string;
  mode: LogDisplayMode;
  query: string;
}) {
  const parsed = useMemo(() => parseStructuredLog(line), [line]);
  if (mode === "raw" || parsed.format === "raw") return <HighlightedText query={query} text={line} />;
  const entries = Object.entries(parsed.fields);
  if (mode === "expanded") {
    return (
      <span className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)]">
        {entries.map(([key, value]) => (
          <span className="contents" key={key}>
            <span className="text-muted-foreground">{key}</span>
            <span className="break-all text-foreground"><HighlightedText query={query} text={stringifyLogValue(value)} /></span>
          </span>
        ))}
      </span>
    );
  }
  const messageKey = ["message", "msg", "log"].find((key) => typeof parsed.fields[key] === "string");
  const message = messageKey ? stringifyLogValue(parsed.fields[messageKey]) : null;
  const metadata = entries.filter(([key]) => key !== messageKey).slice(0, 4);
  return (
    <>
      {message ? <HighlightedText query={query} text={message} /> : null}
      {metadata.map(([key, value]) => (
        <span className="ml-2 text-muted-foreground" key={key}>
          {key}=<span className="text-foreground"><HighlightedText query={query} text={stringifyLogValue(value)} /></span>
        </span>
      ))}
      {entries.length > metadata.length + (message ? 1 : 0) ? (
        <span className="ml-2 text-muted-foreground">+{entries.length - metadata.length - (message ? 1 : 0)}</span>
      ) : null}
    </>
  );
}

function HighlightedText({ query, text }: { query: string; text: string }) {
  if (!query) return <>{text}</>;
  const normalized = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = normalized.indexOf(needle);
  while (index >= 0) {
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(<mark className="rounded-sm bg-accent text-accent-foreground" key={`${index}-${cursor}`}>{text.slice(index, index + query.length)}</mark>);
    cursor = index + query.length;
    index = normalized.indexOf(needle, cursor);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function ToolbarToggle({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      size="icon-sm"
      title={label}
      type="button"
      variant={active ? "secondary" : "ghost"}
    >
      {children}
    </Button>
  );
}

function levelTone(level: LogLevel): string {
  if (level === "error") return "text-destructive";
  if (level === "warn") return "text-warning";
  if (level === "info") return "text-info";
  return "text-foreground";
}

function levelBorder(level: LogLevel): string {
  if (level === "error") return "border-l-destructive";
  if (level === "warn") return "border-l-warning";
  if (level === "info") return "border-l-info";
  if (level === "debug") return "border-l-muted-foreground/50";
  return "border-l-transparent";
}

function formatTime(
  value: string,
  formatDate: ReturnType<typeof useI18n>["formatDate"],
): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatDate(parsed, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function downloadLogs(lines: BottomDockLine[], targetName: string): void {
  const content = lines.map((line) =>
    `${line.observedAt}\t${line.pod}\t${line.container}\t${line.line}`).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${targetName.replace(/[^\w.-]+/g, "-") || "logs"}.log`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
