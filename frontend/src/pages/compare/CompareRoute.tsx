import { ArrowLeftRight, Check, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  ComparableManifest,
  ComparePort,
  ComparePresentationMode,
  CompareResult,
  CompareTarget,
} from "../../features/compare/compareContract";
import { useFilterSearchParams } from "../../features/filters/routeSearchAdapter";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { cn } from "../../shared/lib/cn";
import { compareHref, parseCompareRoute, replaceCompareSide } from "./compareNavigation";
import { useCompare } from "./useCompare";
import { useCompareCandidates } from "./useCompareCandidates";
import { useI18n } from "../../shared/i18n/I18nProvider";
import type { TranslationFunction } from "../../shared/i18n/types";

type CompareSide = "a" | "b";

export function CompareRoute({ port }: { port: ComparePort }) {
  const search = useFilterSearchParams();
  const navigate = useNavigate();
  const identity = useMemo(() => parseCompareRoute(search), [search]);
  const { frame, refresh } = useCompare(port, identity);
  const [mode, setMode] = useState<ComparePresentationMode>("side-by-side");
  const [diffOnly, setDiffOnly] = useState(false);
  const [pickerSide, setPickerSide] = useState<CompareSide | null>(null);
  const candidatesRequest = identity === null ? null : {
    clusterId: identity.clusterId,
    kind: identity.kind,
    apiGroup: identity.apiGroup,
    apiVersion: identity.apiVersion,
  };
  const { frame: candidatesFrame, retry: retryCandidates } = useCompareCandidates(
    port,
    candidatesRequest,
    pickerSide !== null,
  );

  useEffect(() => {
    if (identity === null || frame.phase !== "ready" || identity.apiVersion !== null) return;
    navigate(compareHref({ ...identity, apiVersion: frame.data.descriptor.apiVersion }), { replace: true });
  }, [frame, identity, navigate]);

  if (identity === null) {
    return <ProductStateScreen kind="error" issue={{ code: "invalid-response" }} placement="content" />;
  }
  if (frame.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (frame.phase === "failed") return <FailureScreen failure={frame.failure.code} onRefresh={refresh} />;

  const swap = () => navigate(compareHref({ ...identity, a: identity.b, b: identity.a }));
  const changeSide = (side: CompareSide, target: CompareTarget) => {
    setPickerSide(null);
    navigate(compareHref(replaceCompareSide(identity, side, target)));
  };
  return (
    <ComparePage
      data={frame.data}
      diffOnly={diffOnly}
      mode={mode}
      onChangeSide={setPickerSide}
      onDiffOnlyChange={setDiffOnly}
      onModeChange={setMode}
      onRefresh={refresh}
      onSwap={swap}
      pickerSide={pickerSide}
      candidatesFrame={candidatesFrame}
      onClosePicker={() => setPickerSide(null)}
      onPickCandidate={changeSide}
      onRetryCandidates={retryCandidates}
      refreshing={frame.refreshing}
    />
  );
}

function ComparePage({
  data,
  mode,
  diffOnly,
  refreshing,
  pickerSide,
  candidatesFrame,
  onModeChange,
  onDiffOnlyChange,
  onSwap,
  onRefresh,
  onChangeSide,
  onClosePicker,
  onPickCandidate,
  onRetryCandidates,
}: {
  data: CompareResult;
  mode: ComparePresentationMode;
  diffOnly: boolean;
  refreshing: boolean;
  pickerSide: CompareSide | null;
  candidatesFrame: ReturnType<typeof useCompareCandidates>["frame"];
  onModeChange: (mode: ComparePresentationMode) => void;
  onDiffOnlyChange: (value: boolean) => void;
  onSwap: () => void;
  onRefresh: () => void;
  onChangeSide: (side: CompareSide) => void;
  onClosePicker: () => void;
  onPickCandidate: (side: CompareSide, target: CompareTarget) => void;
  onRetryCandidates: () => void;
}) {
  const { t } = useI18n();
  return (
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 flex-col gap-3 border-b pb-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{t("compare.title")}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {data.descriptor.kubernetesKind} · {data.scope.clusterId} · {data.descriptor.apiGroup || "core"}/{data.descriptor.apiVersion}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="outline">{data.scope.freshness}</Badge>
          <Badge variant="outline">{data.coverage.availability}</Badge>
          <Button disabled={refreshing} onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" className={cn(refreshing && "motion-safe:animate-spin motion-reduce:animate-none")} />{t("common.action.refresh")}
          </Button>
        </div>
      </header>

      {data.coverage.availability !== "available" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground" role="status">
          {t("compare.partialWarning")}
        </p>
      ) : null}

      <section aria-label={t("compare.controls")} className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-1" role="group" aria-label={t("compare.presentationMode")}>
          {data.presentation.modes.map((candidate) => (
            <Button
              aria-pressed={mode === candidate}
              className="capitalize"
              key={candidate}
              onClick={() => onModeChange(candidate)}
              size="sm"
              type="button"
              variant={mode === candidate ? "secondary" : "ghost"}
            >
              {candidate === "side-by-side" ? t("compare.mode.sideBySide") : t("compare.mode.unified")}
            </Button>
          ))}
        </div>
        <Button
          aria-pressed={diffOnly}
          onClick={() => onDiffOnlyChange(!diffOnly)}
          size="sm"
          type="button"
          variant={diffOnly ? "secondary" : "outline"}
        >
          {t("compare.differencesOnly")}
        </Button>
        <Button onClick={onSwap} size="sm" type="button" variant="outline">
          <ArrowLeftRight aria-hidden="true" />{t("compare.swapSides")}
        </Button>
      </section>

      <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" aria-label={t("compare.resources")}>
        <ResourceHeading manifest={data.a} side="a" onChange={onChangeSide} />
        <div className="hidden place-items-center xl:grid"><ArrowLeftRight aria-hidden="true" className="text-muted-foreground" /></div>
        <ResourceHeading manifest={data.b} side="b" onChange={onChangeSide} />
      </section>

      <ComparisonTable a={data.a} b={data.b} diffOnly={diffOnly} mode={mode} />

      {pickerSide !== null ? (
        <CandidatePicker
          frame={candidatesFrame}
          onClose={onClosePicker}
          onPick={(target) => onPickCandidate(pickerSide, target)}
          onRetry={onRetryCandidates}
          side={pickerSide}
          source={pickerSide === "a" ? data.a.resource : data.b.resource}
        />
      ) : null}
    </ProductPageFrame>
  );
}

function ResourceHeading({
  manifest,
  side,
  onChange,
}: {
  manifest: ComparableManifest;
  side: CompareSide;
  onChange: (side: CompareSide) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="flex min-w-0 items-start justify-between gap-3 rounded-xl border bg-card p-4" aria-labelledby={`compare-${side}-title`}>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("compare.side", { side: side.toUpperCase() })}</p>
        <h2 className="truncate text-lg font-semibold" id={`compare-${side}-title`}>{manifest.metadata.name}</h2>
        <p className="truncate text-sm text-muted-foreground">{manifest.metadata.namespace ?? t("compare.clusterScope")}</p>
      </div>
      <Button className="shrink-0" onClick={() => onChange(side)} size="sm" type="button" variant="outline">{t("compare.changeResource")}</Button>
    </section>
  );
}

function ComparisonTable({
  a,
  b,
  mode,
  diffOnly,
}: {
  a: ComparableManifest;
  b: ComparableManifest;
  mode: ComparePresentationMode;
  diffOnly: boolean;
}) {
  const { t } = useI18n();
  const rows = rowsFor(a, b, t).filter((row) => !diffOnly || row.a !== row.b);
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("compare.noDifferences")}</p>;
  }
  return mode === "side-by-side" ? (
    <section className="overflow-hidden rounded-xl border" aria-label={t("compare.sideBySide")}>
      <div className="grid grid-cols-[minmax(9rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/30 text-xs font-medium text-muted-foreground">
        <span className="p-3">{t("compare.field")}</span><span className="truncate p-3">{a.metadata.name}</span><span className="truncate p-3">{b.metadata.name}</span>
      </div>
      <dl>
        {rows.map((row) => <ComparisonRow key={row.path} row={row} />)}
      </dl>
    </section>
  ) : (
    <section className="overflow-hidden rounded-xl border" aria-label={t("compare.unified")}>
      <dl>
        {rows.map((row) => (
          <div className={cn("grid min-w-0 gap-2 border-b p-3 last:border-b-0 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)]", row.a !== row.b && "bg-amber-500/5")} key={row.path}>
            <dt className="font-mono text-xs text-muted-foreground">{row.path}</dt>
            <dd className="grid min-w-0 gap-2 text-sm sm:grid-cols-2"><Value value={row.a} /><Value value={row.b} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ComparisonRow({ row }: { row: { path: string; a: string; b: string } }) {
  return (
    <div className={cn("grid min-w-0 grid-cols-[minmax(9rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b last:border-b-0", row.a !== row.b && "bg-amber-500/5")}>
      <dt className="truncate p-3 font-mono text-xs text-muted-foreground" title={row.path}>{row.path}</dt>
      <dd className="min-w-0 border-l p-3"><Value value={row.a} /></dd>
      <dd className="min-w-0 border-l p-3"><Value value={row.b} /></dd>
    </div>
  );
}

function Value({ value }: { value: string }) {
  return <span className="block break-words font-mono text-sm">{value}</span>;
}

function rowsFor(a: ComparableManifest, b: ComparableManifest, t: TranslationFunction): readonly { path: string; a: string; b: string }[] {
  const left = fieldsFor(a, t);
  const right = fieldsFor(b, t);
  const paths = new Set([...left.keys(), ...right.keys()]);
  return [...paths].sort().map((path) => ({
    path,
    a: left.get(path) ?? t("compare.notObserved"),
    b: right.get(path) ?? t("compare.notObserved"),
  }));
}

function fieldsFor(manifest: ComparableManifest, t: TranslationFunction): Map<string, string> {
  const fields = new Map<string, string>();
  fields.set("metadata.name", manifest.metadata.name);
  fields.set("metadata.namespace", manifest.metadata.namespace ?? t("compare.clusterScope"));
  if (manifest.projection.projectionKind === "workload_replicas") {
    fields.set("spec.replicas", nullableNumber(manifest.projection.replicas, t));
    return fields;
  }
  fields.set("spec.type", manifest.projection.serviceType ?? t("compare.notObserved"));
  manifest.projection.ports.forEach((port, index) => {
    const base = `spec.ports[${index}]`;
    fields.set(`${base}.port`, String(port.port));
    fields.set(`${base}.protocol`, port.protocol ?? t("compare.notObserved"));
    fields.set(`${base}.name`, port.name ?? t("compare.notObserved"));
    fields.set(`${base}.targetPort`, port.targetPortName ?? nullableNumber(port.targetPortNumber, t));
    fields.set(`${base}.nodePort`, nullableNumber(port.nodePort, t));
  });
  return fields;
}

function nullableNumber(value: number | null, t: TranslationFunction): string {
  return value === null ? t("compare.notObserved") : String(value);
}

function CandidatePicker({
  side,
  frame,
  onClose,
  onPick,
  onRetry,
  source,
}: {
  side: CompareSide;
  frame: ReturnType<typeof useCompareCandidates>["frame"];
  onClose: () => void;
  onPick: (target: CompareTarget) => void;
  onRetry: () => void;
  source: CompareResult["a"]["resource"];
}) {
  const { t } = useI18n();
  const listboxId = useId();
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const candidates = frame.phase === "ready"
    ? frame.data.candidates.filter((candidate) => !sameResource(candidate.resource, source))
    : [];
  const filteredCandidates = candidates.filter((candidate) => candidateLabel(candidate.resource)
    .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const activeIndex = clampCandidateIndex(highlightedIndex, filteredCandidates.length);
  const highlightedCandidate = filteredCandidates[activeIndex] ?? null;
  const activeDescendant = highlightedCandidate
    ? candidateOptionId(listboxId, highlightedCandidate.resource)
    : undefined;

  useEffect(() => {
    if (!highlightedCandidate) return;
    optionRefs.current.get(resourceKey(highlightedCandidate.resource))?.scrollIntoView?.({ block: "nearest" });
  }, [highlightedCandidate]);

  const selectHighlighted = () => {
    if (!highlightedCandidate) return;
    onPick(toCompareTarget(highlightedCandidate.resource));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (shouldIgnorePickerShortcut(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (filteredCandidates.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(
        clampCandidateIndex(current, filteredCandidates.length) + 1,
        filteredCandidates.length - 1,
      ));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(clampCandidateIndex(current, filteredCandidates.length) - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(filteredCandidates.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectHighlighted();
    }
  };

  return (
    <section aria-label={t("compare.picker.label", { side: side.toUpperCase() })} className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm" role="dialog">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">{t("compare.picker.title", { side: side.toUpperCase() })}</h2><p className="text-sm text-muted-foreground">{t("compare.picker.description")}</p></div><Button aria-label={t("compare.picker.close")} onClick={onClose} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button></div>
      {frame.phase === "loading" || frame.phase === "idle" ? <p className="text-sm text-muted-foreground">{t("compare.picker.loading")}</p> : null}
      {frame.phase === "failed" ? <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">{t("compare.picker.unavailable")}</p><Button onClick={onRetry} size="sm" type="button" variant="outline">{t("common.action.retry")}</Button></div> : null}
      {frame.phase === "ready" ? (
        <>
          {frame.data.coverage.availability === "available" ? null : <p className="text-sm text-muted-foreground" role="status">{t("compare.picker.partial")}</p>}
          {candidates.length === 0 ? <p className="text-sm text-muted-foreground">{t("compare.picker.empty")}</p> : <>
            <Input
              aria-activedescendant={activeDescendant}
              aria-controls={listboxId}
              aria-expanded="true"
              aria-label={t("compare.picker.filterLabel")}
              autoFocus
              className="font-mono"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("compare.picker.filterPlaceholder")}
              role="combobox"
              value={query}
            />
            {filteredCandidates.length === 0 ? <p className="text-sm text-muted-foreground">{t("compare.picker.noMatches")}</p> : (
              <ul aria-label={t("compare.picker.candidates")} className="grid max-h-72 gap-2 overflow-y-auto pr-1" id={listboxId} role="listbox">
                {filteredCandidates.map((candidate, index) => {
                  const key = resourceKey(candidate.resource);
                  const optionId = candidateOptionId(listboxId, candidate.resource);
                  return (
                    <li key={key}>
                      <Button
                        aria-selected={index === activeIndex}
                        className={cn("w-full justify-between", index === activeIndex && "border-primary bg-primary/10")}
                        id={optionId}
                        onClick={() => onPick(toCompareTarget(candidate.resource))}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        ref={(node) => {
                          if (node) optionRefs.current.set(key, node);
                          else optionRefs.current.delete(key);
                        }}
                        role="option"
                        type="button"
                        variant="outline"
                      >
                        <span className="min-w-0 truncate text-left">{candidateLabel(candidate.resource)}</span><Check aria-hidden="true" className="shrink-0" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>}
        </>
      ) : null}
    </section>
  );
}

function candidateLabel(resource: CompareResult["a"]["resource"]): string {
  return resource.namespace === null ? resource.name : `${resource.namespace}/${resource.name}`;
}

function candidateOptionId(listboxId: string, resource: CompareResult["a"]["resource"]): string {
  return `${listboxId}-${resourceKey(resource)}`;
}

function resourceKey(resource: CompareResult["a"]["resource"]): string {
  return resource.uid;
}

function clampCandidateIndex(index: number, candidateCount: number): number {
  return Math.min(index, Math.max(0, candidateCount - 1));
}

function sameResource(
  left: CompareResult["a"]["resource"],
  right: CompareResult["a"]["resource"],
): boolean {
  return left.uid === right.uid;
}

function toCompareTarget(resource: CompareResult["a"]["resource"]): CompareTarget {
  return { namespace: resource.namespace, name: resource.name };
}

function shouldIgnorePickerShortcut(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  return event.defaultPrevented
    || event.nativeEvent.isComposing
    || event.nativeEvent.keyCode === 229
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.getModifierState("AltGraph");
}

function FailureScreen({ failure, onRefresh }: { failure: string; onRefresh: () => void }) {
  if (failure === "forbidden") return <ProductStateScreen kind="forbidden" issue={{ code: "forbidden" }} placement="content" />;
  if (failure === "unauthorized") return <ProductStateScreen kind="error" issue={{ code: "unknown" }} placement="content" retry={{ onRetry: onRefresh, pending: false }} />;
  if (failure === "not-found" || failure === "identity-incomplete" || failure === "unsupported") return <ProductStateScreen kind="empty" placement="content" />;
  if (failure === "offline") return <ProductStateScreen kind="offline" issue={{ code: "network" }} placement="content" retry={{ onRetry: onRefresh, pending: false }} />;
  return <ProductStateScreen kind="error" issue={{ code: failure === "invalid-request" || failure === "invalid-response" ? "invalid-response" : "unknown" }} placement="content" retry={{ onRetry: onRefresh, pending: false }} />;
}
