import { Braces, ChevronDown, Server } from "lucide-react";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";

import { useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import {
  UnifiedFilterBar,
  type UnifiedFilterBarHandle,
} from "../features/global-filter/UnifiedFilterBar";
import type { GlobalFilterPort } from "../features/global-filter/globalFilterContract";
import { useI18n } from "../shared/i18n";
import { Button } from "../shared/ui/primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../shared/ui/primitives/tooltip";

export type ProductHeaderFilterHandle = UnifiedFilterBarHandle;

export const ProductHeaderFilter = forwardRef<
  ProductHeaderFilterHandle,
  { activeSurfaceId: string; port: GlobalFilterPort }
>(function ProductHeaderFilter({ activeSurfaceId, port }, ref) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  const filterBarRef = useRef<UnifiedFilterBarHandle>(null);
  const clusterAnchorRef = useRef<HTMLDivElement>(null);
  const namespaceAnchorRef = useRef<HTMLDivElement>(null);
  const [activeGroup, setActiveGroup] = useState<"cluster" | "namespace" | null>(null);

  useImperativeHandle(ref, () => ({
    closeGroup: () => filterBarRef.current?.closeGroup(),
    focus: () => filterBarRef.current?.focus(),
    openGroup: (type) => filterBarRef.current?.openGroup(type),
  }), []);

  if (
    activeSurfaceId === "resources" &&
    filter.detail.resourceSurfaceView === "flow"
  ) {
    return (
      <p
        className="truncate text-sm text-muted-foreground"
        data-slot="resources-flow-scope"
      >
        {t("resources.surface.flow.scope")}
      </p>
    );
  }

  if (activeSurfaceId !== "resources") {
    return <UnifiedFilterBar port={port} ref={filterBarRef} />;
  }

  const clusterLabel = scopeLabel(
    filter.state.common.clusters,
    t("resources.graph.clusterGrid.title"),
    t("shell.filter.group.cluster"),
  );
  const namespaceLabel = scopeLabel(
    filter.state.common.namespaces.map(({ namespace }) => namespace),
    t("traffic.scope.allNamespaces"),
    t("shell.filter.group.namespace"),
  );

  return (
    <div
      className="flex min-w-0 w-full flex-nowrap items-center gap-[0.78125rem]"
      data-slot="resources-header-filters"
    >
      <ScopeSelector
        anchorRef={clusterAnchorRef}
        icon={Server}
        label={clusterLabel}
        open={activeGroup === "cluster"}
        onOpen={() => {
          if (activeGroup === "cluster") {
            filterBarRef.current?.closeGroup();
            return;
          }
          setActiveGroup("cluster");
          filterBarRef.current?.openGroup("cluster");
        }}
        widthClass="w-36 max-[1100px]:w-[7.75rem]"
      />
      <ScopeSelector
        anchorRef={namespaceAnchorRef}
        icon={Braces}
        label={namespaceLabel}
        open={activeGroup === "namespace"}
        onOpen={() => {
          if (activeGroup === "namespace") {
            filterBarRef.current?.closeGroup();
            return;
          }
          setActiveGroup("namespace");
          filterBarRef.current?.openGroup("namespace");
        }}
        widthClass="w-48 max-[1100px]:w-[9.25rem]"
      />
      <div className="min-w-0 flex-1">
        <UnifiedFilterBar
          hiddenChipTypes={["cluster", "namespace"]}
          groupAnchor={activeGroup === "cluster" ? clusterAnchorRef : namespaceAnchorRef}
          onGroupOpenChange={setActiveGroup}
          port={port}
          ref={filterBarRef}
        />
      </div>
    </div>
  );
});

function scopeLabel(
  values: readonly string[],
  emptyLabel: string,
  groupLabel: string,
): string {
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return values[0] ?? emptyLabel;
  return `${groupLabel} ${values.length}`;
}

function ScopeSelector({
  anchorRef,
  icon: Icon,
  label,
  open,
  onOpen,
  widthClass,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  icon: typeof Server;
  label: string;
  open: boolean;
  onOpen: () => void;
  widthClass: string;
}) {
  return (
    <div
      className={`flex h-(--product-global-search-height) min-w-0 shrink-0 items-stretch overflow-hidden rounded-[var(--product-radius-md)] border border-border bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 motion-reduce:transition-none ${widthClass}`}
      ref={anchorRef}
    >
      <Tooltip>
        <TooltipTrigger
          render={(
            <Button
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-label={label}
              className="h-full min-w-0 flex-1 justify-start gap-2 rounded-none border-0 bg-transparent px-3 font-medium shadow-none hover:bg-muted/70 focus-visible:ring-0"
              onClick={onOpen}
              title={label}
              type="button"
              variant="ghost"
            />
          )}
        >
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 text-muted-foreground transition-transform data-[open=true]:rotate-180 motion-reduce:transition-none"
            data-open={open || undefined}
          />
        </TooltipTrigger>
        <TooltipContent align="start" className="break-all" side="bottom">
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
