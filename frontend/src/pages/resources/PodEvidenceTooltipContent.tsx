import type { ReactNode } from "react";

import { useI18n } from "../../shared/i18n";
import { TooltipContent } from "../../shared/ui/primitives/tooltip";
import { podUsageLabel } from "./physicalTopologyViewModel";

export interface PodEvidenceTooltipValue {
  cpuMillicores: number | null;
  cpuRequestMillicores: number | null;
  memoryMebibytes: number | null;
  memoryRequestMebibytes: number | null;
  name: string;
  namespace: string | null;
  phase: string;
  restartCount: number;
  usagePercent: number | null;
}

export function PodEvidenceTooltipContent({
  align = "start",
  id,
  pod,
  side = "top",
  slot = "pod-evidence-tooltip",
  usageText,
}: {
  align?: "center" | "end" | "start";
  id: string;
  pod: PodEvidenceTooltipValue;
  side?: "bottom" | "left" | "right" | "top";
  slot?: string;
  usageText?: string | null;
}) {
  const fallbackUsageLabel = pod.usagePercent === null
    ? null
    : podUsageLabel(pod.usagePercent);
  const usageLabel = usageText === undefined ? fallbackUsageLabel : usageText;
  return (
    <TooltipContent
      align={align}
      className="w-72 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
      data-slot={slot}
      id={id}
      role="tooltip"
      side={side}
    >
      <PodEvidenceTooltipPanel pod={pod} usageText={usageLabel} />
    </TooltipContent>
  );
}

export function PodEvidenceTooltipPanel({
  pod,
  usageText,
}: {
  pod: PodEvidenceTooltipValue;
  usageText: string | null;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <>
      <div className="border-b border-background/15 px-3 py-2.5">
        <p className="break-all text-xs font-semibold leading-snug">{pod.name}</p>
        <p className="mt-0.5 text-[0.6875rem] text-background/70">
          {[pod.namespace, pod.phase].filter(Boolean).join(" / ")}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-3 py-2.5 text-[0.6875rem]">
        {usageText === null ? null : (
          <EvidenceRow
            label={t("resources.graph.pod.evidence.usage")}
            value={usageText}
          />
        )}
        <MetricEvidenceRow
          actual={pod.cpuMillicores}
          label={t("resources.graph.pod.evidence.cpu")}
          request={pod.cpuRequestMillicores}
          unit="m"
        />
        <MetricEvidenceRow
          actual={pod.memoryMebibytes}
          label={t("resources.graph.pod.evidence.memory")}
          request={pod.memoryRequestMebibytes}
          unit=" MiB"
        />
        <EvidenceRow
          label={t("resources.graph.pod.evidence.restarts")}
          value={formatNumber(pod.restartCount)}
        />
      </dl>
    </>
  );
}

function MetricEvidenceRow({
  actual,
  label,
  request,
  unit,
}: {
  actual: number | null;
  label: string;
  request: number | null;
  unit: string;
}) {
  const { formatNumber, t } = useI18n();
  if (actual === null && request === null) return null;
  const numberOptions: Intl.NumberFormatOptions = { maximumFractionDigits: 3 };
  return (
    <EvidenceRow
      label={label}
      value={(
        <span className="flex min-w-0 justify-end gap-x-1 whitespace-nowrap">
          {actual === null ? null : (
            <span>{formatNumber(actual, numberOptions)}{unit}</span>
          )}
          {request === null ? null : (
            <span className="text-background/65">
              {t("resources.graph.pod.evidence.request", {
                value: `${formatNumber(request, numberOptions)}${unit}`,
              })}
            </span>
          )}
        </span>
      )}
    />
  );
}

function EvidenceRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <>
      <dt className="text-background/65">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </>
  );
}
