import { CircleAlert, Clock3, TriangleAlert } from "lucide-react";
import type { HomeClusterChoice, HomeClusterOverview } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { Surface } from "../../shared/ui/Surface";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../../shared/ui/primitives/item";
import { ScrollArea } from "../../shared/ui/primitives/scroll-area";
import { HomeRefreshFailure, HomeSectionFailure, HomeSectionLoading } from "./HomeSectionFeedback";
import type { HomeResourceState } from "./useHomePageState";

export function HomeIssuesRail({
  cluster,
  overview,
  onRefresh,
}: {
  cluster: HomeClusterChoice | null;
  overview: HomeResourceState<HomeClusterOverview>;
  onRefresh: () => void;
}) {
  const { formatNumber, t } = useI18n();
  const busy = overview.phase === "loading" || overview.phase === "idle" ||
    (overview.phase === "ready" && overview.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      as="aside"
      aria-labelledby="active-issues-title"
      className="grid min-w-0 content-start overflow-hidden"
    >
      <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 border-b p-4">
        <h2 className="truncate text-base font-semibold" id="active-issues-title">
          {t("home.section.activeIssues")}
        </h2>
        {overview.phase === "ready" ? (
          <span className="line-clamp-2 text-right text-xs text-muted-foreground">
            {t("home.issue.counts", {
              incidents: cluster?.incidentCount == null
                ? t("common.value.unavailable")
                : formatNumber(cluster.incidentCount),
              shown: formatNumber(overview.data.incidents.length),
              warnings: formatNumber(overview.data.warnings.length),
            })}
          </span>
        ) : null}
      </div>
      <IssueContent onRefresh={onRefresh} overview={overview} />
    </Surface>
  );
}

function IssueContent({
  onRefresh,
  overview,
}: {
  onRefresh: () => void;
  overview: HomeResourceState<HomeClusterOverview>;
}) {
  const { t } = useI18n();
  if (overview.phase === "loading" || overview.phase === "idle") {
    return <HomeSectionLoading label={t("home.section.activeIssues")} />;
  }
  if (overview.phase === "failed") {
    return (
      <HomeSectionFailure
        failure={overview.failure}
        label={t("home.section.activeIssues")}
        onRetry={onRefresh}
      />
    );
  }
  if (overview.data.incidents.length === 0 && overview.data.warnings.length === 0) {
    return (
      <>
        <HomeRefreshFailure
          failure={overview.refreshFailure}
          label={t("home.section.activeIssues")}
          onRetry={onRefresh}
        />
        <div className="grid min-h-40 place-items-center gap-2 p-6 text-center">
          <CircleAlert aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("home.issue.empty")}
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      <HomeRefreshFailure
        failure={overview.refreshFailure}
        label={t("home.section.activeIssues")}
        onRetry={onRefresh}
      />
      <ScrollArea
        aria-label={t("home.issue.list")}
        className="max-h-[32rem]"
        orientation="vertical"
      >
        <div className="grid gap-2 p-3 pr-4">
        {overview.data.incidents.map((incident) => (
          <Item key={incident.id} variant="muted">
            <ItemMedia variant="icon"><CircleAlert aria-hidden="true" className="text-destructive" /></ItemMedia>
            <ItemContent>
              <ItemTitle>{incident.symptom ?? t("home.issue.analyzing")}</ItemTitle>
              <ItemDescription>
                {resourceLabel(
                  incident.resourceKind,
                  incident.resourceName,
                  t("home.issue.resourceUnknown"),
                )}
              </ItemDescription>
              <IssueTime value={incident.createdAt} />
            </ItemContent>
          </Item>
        ))}
        {overview.data.warnings.map((warning) => (
          <Item key={warning.id} variant="outline">
            <ItemMedia variant="icon"><TriangleAlert aria-hidden="true" className="text-status-warning" /></ItemMedia>
            <ItemContent>
              <ItemTitle>{warning.reason ?? warning.name}</ItemTitle>
              <ItemDescription>{warning.message ?? t("home.issue.noDetail")}</ItemDescription>
              <IssueTime value={warning.lastSeenAt} />
            </ItemContent>
          </Item>
        ))}
        </div>
      </ScrollArea>
    </>
  );
}

function IssueTime({ value }: { value: string | null }) {
  const { formatDate, t } = useI18n();
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock3 aria-hidden="true" className="size-3" />
      {value
        ? formatDate(new Date(value), { dateStyle: "short", timeStyle: "short" })
        : t("home.issue.timeUnknown")}
    </span>
  );
}

function resourceLabel(kind: string | null, name: string | null, fallback: string) {
  const values = [kind, name].filter((value): value is string => Boolean(value));
  return values.length ? values.join(" · ") : fallback;
}
