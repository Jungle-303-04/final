import { Popover } from "@base-ui/react/popover";
import { Columns3, Rows3, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import type { FlowDirection } from "./workflowGraphTypes";

export function WorkflowViewSettings({
  direction,
  showCheckpoints,
  showMetadata,
  compact,
  setDirection,
  setShowCheckpoints,
  setShowMetadata,
  setCompact,
}: {
  direction: FlowDirection;
  showCheckpoints: boolean;
  showMetadata: boolean;
  compact: boolean;
  setDirection: (direction: FlowDirection) => void;
  setShowCheckpoints: (checked: boolean) => void;
  setShowMetadata: (checked: boolean) => void;
  setCompact: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger render={<Button aria-label={t("workflows.graph.settings")} size="icon-sm" variant="ghost" />}>
        <Settings2 aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className="isolate z-[100]"
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "end" }}
          collisionPadding={{ top: 16, right: 16, bottom: 16, left: 72 }}
          positionMethod="fixed"
          side="bottom"
          sideOffset={8}
        >
          <Popover.Popup className="grid w-[min(20rem,calc(100vw-5.5rem))] min-w-0 gap-4 rounded-xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
            <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
              <Popover.Title className="shrink-0 text-sm font-semibold whitespace-nowrap">{t("workflows.graph.settings")}</Popover.Title>
              <Popover.Description className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={t("workflows.graph.settingsDescription")}>
                {t("workflows.graph.settingsDescription")}
              </Popover.Description>
            </div>
            <fieldset className="grid min-w-0 gap-2">
              <legend className="text-xs font-medium text-muted-foreground">{t("workflows.graph.direction")}</legend>
              <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
                <DirectionButton active={direction === "LR"} icon={<Columns3 aria-hidden="true" />} label={t("workflows.graph.horizontal")} onClick={() => setDirection("LR")} />
                <DirectionButton active={direction === "TB"} icon={<Rows3 aria-hidden="true" />} label={t("workflows.graph.vertical")} onClick={() => setDirection("TB")} />
              </div>
            </fieldset>
            <ViewToggle checked={showCheckpoints} description={t("workflows.graph.checkpointsDescription")} label={t("workflows.graph.checkpoints")} onChange={setShowCheckpoints} />
            <ViewToggle checked={showMetadata} description={t("workflows.graph.metadataDescription")} label={t("workflows.graph.metadata")} onChange={setShowMetadata} />
            <ViewToggle checked={compact} description={t("workflows.graph.compactDescription")} label={t("workflows.graph.compact")} onChange={setCompact} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DirectionButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-pressed={active} className="flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm [&_svg]:size-3.5 [&_svg]:shrink-0" onClick={onClick} type="button">
      {icon}<span className="truncate">{label}</span>
    </button>
  );
}

function ViewToggle({ checked, label, description, onChange }: { checked: boolean; label: string; description: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center justify-between gap-4">
      <span className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <strong className="shrink-0 text-xs font-medium text-foreground whitespace-nowrap">{label}</strong>
        <small className="min-w-0 flex-1 truncate border-l pl-2 text-[0.6875rem] text-muted-foreground" title={description}>{description}</small>
      </span>
      <input checked={checked} className="size-4 shrink-0 accent-primary" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}
