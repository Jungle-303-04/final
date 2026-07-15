import { Boxes, RefreshCw, ShieldAlert } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import { applicationsGitOpsCopy } from "../../shared/i18n/applicationsGitOpsCopy";
import type {
  ApplicationSummary,
  ApplicationsGitOpsFailure,
  ApplicationsGitOpsPort,
} from "./applicationsGitOpsContract";
import { useApplicationsCatalog } from "./useApplicationsGitOpsData";

export function ApplicationsSurface({ port }: { port: ApplicationsGitOpsPort }) {
  const { locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  const [catalog, refresh] = useApplicationsCatalog(port);

  if (catalog.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (catalog.phase === "failed") {
    return <SurfaceFailure failure={catalog.failure} onRetry={refresh} />;
  }

  return (
    <ProductPageFrame>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="font-display text-2xl font-normal tracking-wide">{copy.applications.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.applications.description}</p>
        </div>
        <Button
          aria-label={copy.common.refresh}
          disabled={catalog.refreshing}
          onClick={refresh}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className={catalog.refreshing ? "motion-safe:animate-spin" : undefined} />
        </Button>
      </header>

      <Alert>
        <ShieldAlert aria-hidden="true" />
        <AlertDescription>{copy.applications.scopeNotice}</AlertDescription>
      </Alert>

      {catalog.data.applications.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {copy.applications.empty}
        </p>
      ) : (
        <ul className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {catalog.data.applications.map((application) => (
            <li className="min-w-0" key={application.id}>
              <ApplicationCard application={application} />
            </li>
          ))}
        </ul>
      )}
    </ProductPageFrame>
  );
}

function ApplicationCard({ application }: { application: ApplicationSummary }) {
  const { locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  const repository = application.repositoryRef ?? application.repositoryId;
  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Boxes aria-hidden="true" className="size-4" />
        </div>
        <CardTitle className="mt-2 truncate" title={application.name}>{application.name}</CardTitle>
        <CardDescription className="truncate font-mono text-xs" title={application.id}>
          {application.id}
        </CardDescription>
        <CardAction>
          <StatusMark
            label={application.status ?? copy.common.unknown}
            tone={statusTone(application.status)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Fact label={copy.applications.repository} value={repository} />
        <div className="grid grid-cols-2 gap-3">
          <Fact label={copy.applications.branch} value={application.branch} />
          <Fact label={copy.applications.status} value={application.status} />
        </div>
        <Fact label={copy.applications.manifest} value={application.manifestPath} />
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  const { locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {value === null ? (
        <Badge variant="outline">{copy.common.unavailable}</Badge>
      ) : (
        <span className="truncate text-sm" title={value}>{value}</span>
      )}
    </div>
  );
}

export function SurfaceFailure({
  failure,
  onRetry,
}: {
  failure: ApplicationsGitOpsFailure;
  onRetry: () => void;
}) {
  const { locale } = useI18n();
  const copy = applicationsGitOpsCopy(locale);
  return (
    <ProductPageFrame className="min-h-[28rem] place-items-center">
      <div className="grid max-w-lg justify-items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <ShieldAlert aria-hidden="true" className="size-9 text-muted-foreground" />
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold">{copy.common.unavailable}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{copy.failures[failure.code]}</p>
        </div>
        <Button onClick={onRetry} type="button" variant="outline">
          <RefreshCw aria-hidden="true" />
          {copy.common.retry}
        </Button>
      </div>
    </ProductPageFrame>
  );
}

function statusTone(status: string | null): StatusTone {
  if (status === null) return "unknown";
  const normalized = status.toLowerCase();
  if (["active", "healthy", "ready", "succeeded", "completed"].includes(normalized)) return "healthy";
  if (["failed", "error", "blocked", "degraded"].includes(normalized)) return "critical";
  if (["pending", "running", "progressing"].includes(normalized)) return "warning";
  return "unknown";
}

export function applicationStatusTone(status: string | null): StatusTone {
  return statusTone(status);
}
