import { CircleAlert } from "lucide-react";
import type {
  IssueDetail,
  IssuesPortFailure,
} from "../../features/issues/issuesContract";
import { useI18n, type I18nController } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../shared/ui/primitives/sheet";
import { Skeleton } from "../../shared/ui/primitives/skeleton";

export function IssueDetailSheet({
  detail,
  failure,
  loading,
  onOpenChange,
  open,
}: {
  detail: IssueDetail | null;
  failure: IssuesPortFailure | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useI18n();

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-busy={loading || undefined}
        className="w-full sm:max-w-2xl"
        closeLabel={t("issues.detail.close")}
        side="right"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t("issues.detail.title")}</SheetTitle>
          <SheetDescription>
            {detail
              ? resourceLabel(detail, t("issues.target.unavailable"))
              : t("issues.detail.description")}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <DetailBody detail={detail} failure={failure} loading={loading} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  detail,
  failure,
  loading,
}: {
  detail: IssueDetail | null;
  failure: IssuesPortFailure | null;
  loading: boolean;
}) {
  const { t } = useI18n();

  if (detail === null && loading) return <DetailLoading />;
  if (detail === null && failure !== null) return <DetailFailure failure={failure} />;
  if (detail === null) {
    return <DetailFailure failure={{ code: "invalid-response" }} />;
  }
  return (
    <div className="grid gap-4 py-4">
      {failure ? <BackgroundFailure failure={failure} /> : null}
      {detail.dataQualityWarnings.length > 0 ? <PartialDetail /> : null}
      <section aria-labelledby="issue-status-title" className="grid gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium" id="issue-status-title">
            {t("issues.detail.section.status")}
          </h3>
          <StatusMark
            label={displayText(detail.status, t("common.state.unknown"))}
            tone="unknown"
          />
        </div>
        <DetailMeta detail={detail} />
      </section>
      <TextSection
        id="issue-symptom-title"
        title={t("issues.detail.section.symptom")}
        value={detail.symptom}
      />
      <TextSection
        id="issue-root-cause-title"
        title={t("issues.detail.section.rootCause")}
        value={detail.rootCause}
      />
      <EvidenceSection
        items={detail.supportingEvidence ?? []}
        title={t("issues.detail.section.evidence")}
        titleId="issue-supporting-evidence-title"
      />
      <EvidenceSection
        items={detail.missingEvidence ?? []}
        title={t("issues.detail.section.missingEvidence")}
        titleId="issue-missing-evidence-title"
      />
      <TextSection
        id="issue-error-title"
        title={t("issues.detail.section.error")}
        value={detail.errorReason}
      />
    </div>
  );
}

function DetailLoading() {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 py-6" role="status">
      <span className="sr-only">{t("issues.detail.loading")}</span>
      <Skeleton aria-hidden="true" className="h-24" />
      <Skeleton aria-hidden="true" className="h-32" />
    </div>
  );
}

function DetailFailure({ failure }: { failure: Pick<IssuesPortFailure, "code"> }) {
  const { t } = useI18n();
  const copy = failureCopy(failure.code, t);
  return (
    <Alert className="mt-4" variant={failure.code === "forbidden" ? "default" : "destructive"}>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
    </Alert>
  );
}

function BackgroundFailure({ failure }: { failure: IssuesPortFailure }) {
  const { t } = useI18n();

  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("issues.detail.refreshFailed.title")}</AlertTitle>
      <AlertDescription>
        {t("issues.detail.refreshFailed.description")} {failureCopy(failure.code, t).description}
      </AlertDescription>
    </Alert>
  );
}

function PartialDetail() {
  const { t } = useI18n();

  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("issues.detail.partial.title")}</AlertTitle>
      <AlertDescription>{t("issues.detail.partial.description")}</AlertDescription>
    </Alert>
  );
}

function DetailMeta({ detail }: { detail: IssueDetail }) {
  const { formatDate, formatNumber, t } = useI18n();
  const entries = [
    [t("issues.detail.meta.target"), resourceLabel(detail, t("issues.target.unavailable"))],
    [
      t("issues.detail.meta.updated"),
      formatTimestamp(detail.updatedAt, formatDate, t("issues.time.unknown")),
    ],
    ...(detail.confidence === null
      ? []
      : [[
          t("issues.detail.meta.confidence"),
          formatNumber(detail.confidence, {
            maximumFractionDigits: 0,
            style: "percent",
          }),
        ]]),
  ];
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="break-words font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TextSection({ id, title, value }: { id: string; title: string; value: string | null }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <section aria-labelledby={id} className="grid gap-2 rounded-lg border p-4">
      <h3 className="font-medium" id={id}>{title}</h3>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
    </section>
  );
}

function EvidenceSection({
  items,
  title,
  titleId,
}: {
  items: readonly string[];
  title: string;
  titleId: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="grid gap-2 rounded-lg border p-4">
      <h3 className="font-medium" id={titleId}>{title}</h3>
      <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
        {items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}
      </ul>
    </section>
  );
}

function failureCopy(
  code: IssuesPortFailure["code"],
  t: I18nController["t"],
) {
  if (code === "not-found") {
    return {
      title: t("issues.detail.failure.notFound.title"),
      description: t("issues.detail.failure.notFound.description"),
    };
  }
  if (code === "forbidden") {
    return {
      title: t("issues.detail.failure.forbidden.title"),
      description: t("issues.detail.failure.forbidden.description"),
    };
  }
  if (code === "offline") {
    return {
      title: t("issues.detail.failure.offline.title"),
      description: t("issues.detail.failure.offline.description"),
    };
  }
  if (code === "rate-limited") {
    return {
      title: t("issues.detail.failure.rateLimited.title"),
      description: t("issues.detail.failure.rateLimited.description"),
    };
  }
  if (code === "invalid-response") {
    return {
      title: t("issues.detail.failure.invalidResponse.title"),
      description: t("issues.detail.failure.invalidResponse.description"),
    };
  }
  return {
    title: t("issues.detail.failure.generic.title"),
    description: t("issues.detail.failure.generic.description"),
  };
}

function displayText(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function resourceLabel(detail: IssueDetail, unavailable: string): string {
  const kind = detail.resourceKind?.trim() || null;
  const name = detail.resourceName?.trim() || null;
  const namespace = detail.namespace?.trim() || null;
  const coordinate = name === null ? null : namespace ? `${namespace}/${name}` : name;
  const values = [kind, coordinate].filter((value): value is string => value !== null);
  return values.length > 0 ? values.join(" · ") : unavailable;
}

function formatTimestamp(
  value: string | null,
  formatDate: I18nController["formatDate"],
  unavailable: string,
): string {
  if (!value) return unavailable;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return unavailable;
  return formatDate(parsed, {
    dateStyle: "short",
    timeStyle: "short",
  });
}
