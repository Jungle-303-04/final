import { CircleAlert, Clock3 } from "lucide-react";
import type { HomeClusterChoice, HomeClusterOverview } from "../../features/home/homeContract";
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
  const busy = overview.phase === "loading" || overview.phase === "idle" ||
    (overview.phase === "ready" && overview.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      as="aside"
      aria-labelledby="active-issues-title"
      className="grid min-w-0 content-start overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <h2 className="text-base font-semibold" id="active-issues-title">활성 이슈</h2>
        {overview.phase === "ready" ? (
          <span className="text-xs text-muted-foreground">
            인시던트 {cluster?.incidentCount ?? "—"} · 표시 {overview.data.incidents.length}
            {" · "}경고 {overview.data.warnings.length}
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
  if (overview.phase === "loading" || overview.phase === "idle") {
    return <HomeSectionLoading label="활성 이슈" />;
  }
  if (overview.phase === "failed") {
    return <HomeSectionFailure failure={overview.failure} label="활성 이슈" onRetry={onRefresh} />;
  }
  if (overview.data.incidents.length === 0 && overview.data.warnings.length === 0) {
    return (
      <>
        <HomeRefreshFailure failure={overview.refreshFailure} label="활성 이슈" onRetry={onRefresh} />
        <div className="grid min-h-40 place-items-center gap-2 p-6 text-center">
          <CircleAlert aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            현재 응답에 표시된 이슈가 없습니다. 전체 수 미확인.
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      <HomeRefreshFailure failure={overview.refreshFailure} label="활성 이슈" onRetry={onRefresh} />
      <ScrollArea
        aria-label="활성 이슈 목록"
        className="max-h-[32rem]"
        orientation="vertical"
      >
        <div className="grid gap-2 p-3 pr-4">
        {overview.data.incidents.map((incident) => (
          <Item key={incident.id} variant="muted">
            <ItemMedia variant="icon"><CircleAlert aria-hidden="true" /></ItemMedia>
            <ItemContent>
              <ItemTitle>{incident.symptom ?? "원인을 분석 중인 인시던트"}</ItemTitle>
              <ItemDescription>
                {resourceLabel(incident.resourceKind, incident.resourceName)}
              </ItemDescription>
              <IssueTime value={incident.createdAt} />
            </ItemContent>
          </Item>
        ))}
        {overview.data.warnings.map((warning) => (
          <Item key={warning.id} variant="outline">
            <ItemMedia variant="icon"><CircleAlert aria-hidden="true" /></ItemMedia>
            <ItemContent>
              <ItemTitle>{warning.reason ?? warning.name}</ItemTitle>
              <ItemDescription>{warning.message ?? "상세 메시지가 없습니다."}</ItemDescription>
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
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock3 aria-hidden="true" className="size-3" />
      {value ? new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value)) : "시간 알 수 없음"}
    </span>
  );
}

function resourceLabel(kind: string | null, name: string | null) {
  const values = [kind, name].filter((value): value is string => Boolean(value));
  return values.length ? values.join(" · ") : "리소스 정보 없음";
}
