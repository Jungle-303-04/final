import {
  AlertTriangle,
  CheckCircle2,
  GitCommitHorizontal,
  Siren,
} from "lucide-react";
import { cn } from "../../shared/lib/cn";
import type {
  ApplicationCardModel,
  ApplicationCurrentDeployment,
} from "./applicationsContract";
import { shortSha } from "./applicationPresentation";

export function ApplicationReadyBar({
  health,
  label,
  unavailable,
}: {
  health: ApplicationCardModel["health"];
  label: string;
  unavailable: string;
}) {
  const { readyPods, totalPods } = health;
  if (readyPods === null || totalPods === null) {
    return (
      <span
        className="text-xs text-muted-foreground"
        data-testid="application-ready-bar"
      >
        {unavailable}
      </span>
    );
  }

  const percentage = totalPods > 0
    ? Math.min(100, Math.round((readyPods / totalPods) * 100))
    : 0;
  const tone = readyPods >= totalPods && totalPods > 0
    ? "bg-status-healthy"
    : readyPods === 0
      ? "bg-destructive"
      : "bg-status-warning";

  return (
    <span
      className="inline-flex items-center gap-2"
      data-testid="application-ready-bar"
    >
      {totalPods > 0 ? (
        <span
          aria-label={label}
          aria-valuemax={totalPods}
          aria-valuemin={0}
          aria-valuenow={readyPods}
          className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <span
            className={cn("block h-full rounded-full", tone)}
            data-slot="application-ready-fill"
            style={{ width: `${percentage}%` }}
          />
        </span>
      ) : null}
      <span className="font-mono text-xs font-medium tabular-nums">
        {readyPods}/{totalPods}
      </span>
    </span>
  );
}

export function ApplicationDeploymentChannel({
  deployment,
  unavailable,
  withIcon = false,
}: {
  deployment: ApplicationCurrentDeployment | null;
  unavailable: string;
  withIcon?: boolean;
}) {
  const sha = shortSha(deployment?.gitSha ?? null);
  const hasEvidence = Boolean(deployment?.version || sha);
  return (
    <span
      className="flex min-w-0 items-center gap-2"
      data-testid="application-deployment-channel"
    >
      {withIcon ? (
        <GitCommitHorizontal
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      ) : null}
      {hasEvidence ? (
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {deployment?.version ? (
            <span className="truncate font-medium" title={deployment.version}>
              {deployment.version}
            </span>
          ) : null}
          {sha ? (
            <code className="text-xs text-muted-foreground" title={deployment?.gitSha ?? undefined}>
              {sha}
            </code>
          ) : null}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{unavailable}</span>
      )}
    </span>
  );
}

export function ApplicationDriftChannel({
  application,
  aligned,
  drift,
  unavailable,
}: {
  application: ApplicationCardModel;
  aligned: string;
  drift: string;
  unavailable: string;
}) {
  if (application.hasDrift === null) {
    return <UnavailableChannel testId="application-drift-channel" text={unavailable} />;
  }
  if (!application.hasDrift) {
    return (
      <span
        className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        data-testid="application-drift-channel"
      >
        <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-status-healthy" />
        <span className="truncate">{aligned}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-xs text-destructive"
      data-testid="application-drift-channel"
    >
      <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate" title={application.driftSummary ?? drift}>
        {application.driftSummary ?? drift}
      </span>
    </span>
  );
}

export function ApplicationIncidentChannel({
  count,
  noIncidents,
  openIncidents,
  unavailable,
}: {
  count: number | null;
  noIncidents: string;
  openIncidents: string;
  unavailable: string;
}) {
  if (count === null) {
    return <UnavailableChannel testId="application-incident-channel" text={unavailable} />;
  }
  if (count === 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        data-testid="application-incident-channel"
      >
        <CheckCircle2 aria-hidden="true" className="size-3.5 text-status-healthy" />
        {noIncidents}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive"
      data-testid="application-incident-channel"
    >
      <Siren aria-hidden="true" className="size-3.5" />
      {openIncidents} <span className="font-mono tabular-nums">{count}</span>
    </span>
  );
}

function UnavailableChannel({ testId, text }: { testId: string; text: string }) {
  return (
    <span className="text-xs text-muted-foreground" data-testid={testId}>
      {text}
    </span>
  );
}
