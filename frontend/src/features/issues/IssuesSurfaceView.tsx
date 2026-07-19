import { RefreshCw } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { Button } from "../../shared/ui/primitives/button";
import { Surface } from "../../shared/ui/Surface";
import { IssuesListPanel } from "./IssuesListPanel";
import { IssuesPanels } from "./IssuesPanels";
import type {
  IssuesSurfaceCopy,
  RecoverySelectionCapability,
} from "./issuesSurfaceContract";
import type { IssuesSurfaceController } from "./useIssuesSurfaceController";

type IssuesSurfaceViewProps = IssuesSurfaceController & {
  copy: IssuesSurfaceCopy;
  recoverySelection: RecoverySelectionCapability;
};

export function IssuesSurfaceView({
  closeIssue,
  copy,
  detailFull,
  detailRegionId,
  detailRegionRef,
  lastRefreshedAt,
  list,
  loadMoreAudit,
  panels,
  recoverySelection,
  refreshList,
  selectIssue,
  selected,
  selectRecovery,
  setDetailFull,
}: IssuesSurfaceViewProps) {
  return (
    <Surface
      as="div"
      className="flex min-h-96 min-w-0 overflow-hidden"
      data-detail-layout={selected === null ? "closed" : detailFull ? "full" : "peek"}
    >
      <section
        aria-label={copy.listLabel}
        className={selected === null
          ? "min-w-0 flex-1"
          : detailFull
            ? "hidden min-w-0 lg:block lg:basis-0 lg:flex-none lg:overflow-hidden lg:opacity-0 lg:pointer-events-none lg:transition-[flex-basis,opacity] lg:duration-(--motion-page) lg:ease-(--ease-page) motion-reduce:transition-none"
            : "hidden min-w-0 flex-1 lg:block lg:opacity-100 lg:transition-[flex-basis,opacity] lg:duration-(--motion-page) lg:ease-(--ease-page) motion-reduce:transition-none"}
        role="region"
      >
        <header className="flex min-h-16 flex-row items-center gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-none">{copy.listLabel}</h2>
            {lastRefreshedAt !== null ? (
              <time
                className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground"
                dateTime={new Date(lastRefreshedAt).toISOString()}
              >
                {copy.updated} · {copy.auditTime(new Date(lastRefreshedAt).toISOString())}
              </time>
            ) : null}
          </div>
          <Button
            aria-label={copy.refresh}
            onClick={refreshList}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" className={cn(list.loading && "motion-safe:animate-spin")} />
          </Button>
        </header>
        <div className="px-5 lg:min-h-96">
          <IssuesListPanel
            copy={copy}
            detailRegionId={detailRegionId}
            list={list}
            onSelect={selectIssue}
            selected={selected}
          />
        </div>
      </section>
      {selected === null ? null : (
        <div className={cn(
          "min-w-0 w-full basis-full shrink-0 border-l animate-in fade-in-0 slide-in-from-right-4 transition-[flex-basis] duration-(--motion-page) ease-(--ease-page) motion-reduce:animate-none motion-reduce:transition-none",
          detailFull ? "lg:basis-full" : "lg:basis-[42rem]",
        )}
        >
          <IssuesPanels
            capability={recoverySelection}
            copy={copy}
            detailRegionId={detailRegionId}
            detailRegionRef={detailRegionRef}
            full={detailFull}
            onClose={closeIssue}
            onFullChange={setDetailFull}
            onLoadMoreAudit={loadMoreAudit}
            onSelectRecovery={selectRecovery}
            selected={selected}
            state={panels}
          />
        </div>
      )}
    </Surface>
  );
}
