import { CircleAlert, Inbox, LockKeyhole } from "lucide-react";
import { useState } from "react";
import type { HomeClusterChoices } from "../../features/home/homeContract";
import type {
  ResourceCatalog,
  ResourceList,
  ResourcesPortFailure,
} from "../../features/resources/resourcesContract";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import type { ResourcesResourceState } from "./resourcesPageStateModel";

export function UnknownCompletenessEmpty({ variant }: { variant: "catalog" | "list" }) {
  const title = variant === "catalog"
    ? "관측된 리소스 종류가 없습니다"
    : "현재 응답에서 관측된 리소스가 없습니다";
  return (
    <Surface aria-labelledby="resources-unknown-empty-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <Inbox aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold" id="resources-unknown-empty-title">{title}</h2>
        <p className="text-sm text-muted-foreground">조회 응답에서 관측된 항목은 0건입니다.</p>
        <p className="text-sm text-muted-foreground">전체 범위의 부재는 확인할 수 없습니다.</p>
      </div>
    </Surface>
  );
}

export function ResourcesDenied({ onRetry }: { onRetry: () => void }) {
  return (
    <Surface aria-labelledby="resources-denied-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <LockKeyhole aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold" id="resources-denied-title">
          이 범위에 접근할 수 없습니다
        </h2>
        <p className="text-sm text-muted-foreground">
          이전 리소스 응답은 숨겼습니다. 권한이 변경됐다면 서버에서 다시 확인하세요.
        </p>
        <Button onClick={onRetry} type="button">권한 다시 확인</Button>
      </div>
    </Surface>
  );
}

export function ResourcesFailure({
  failure,
  onRetry,
  retryWaitSeconds,
}: {
  failure: ResourcesPortFailure;
  onRetry: () => void;
  retryWaitSeconds: number | null;
}) {
  if (failure.code === "forbidden") return <ResourcesDenied onRetry={onRetry} />;
  if (failure.code === "rate-limited" && retryWaitSeconds !== null) {
    return (
      <Surface aria-labelledby="resources-rate-limit-title" className="grid min-h-72 place-items-center p-6">
        <div className="grid max-w-md justify-items-center gap-3 text-center">
          <CircleAlert aria-hidden="true" className="size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold" id="resources-rate-limit-title">요청 한도에 도달했습니다</h2>
          <p className="text-sm text-muted-foreground">
            서버가 지정한 {retryWaitSeconds}초 이후 자동으로 다시 확인합니다.
          </p>
        </div>
      </Surface>
    );
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ label: "다시 불러오기", onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{ label: "다시 불러오기", onRetry, pending: false }}
    />
  );
}

export function ResourcesRefreshFeedback({
  catalog,
  choices,
  list,
}: {
  catalog: ResourcesResourceState<ResourceCatalog>;
  choices: ResourcesResourceState<HomeClusterChoices>;
  list: ResourcesResourceState<ResourceList>;
}) {
  const failures = [
    refreshMessage(choices, "클러스터 목록을 갱신하지 못했습니다"),
    refreshMessage(catalog, "리소스 종류를 갱신하지 못했습니다"),
    refreshMessage(list, "목록을 갱신하지 못했습니다"),
  ].filter((message): message is string => message !== null);
  if (failures.length === 0) return null;
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>일부 정보를 갱신하지 못했습니다</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {failures.map((message) => <li key={message}>{message}</li>)}
        </ul>
        <p>마지막으로 검증된 실 API 응답을 유지합니다.</p>
      </AlertDescription>
    </Alert>
  );
}

export function CatalogFreshness({ observedAt }: { observedAt: string | null }) {
  const [renderedAt] = useState(() => Date.now());

  if (observedAt === null) {
    return <Badge variant="outline">관측 시각 미제공</Badge>;
  }
  const ageMilliseconds = Math.max(0, renderedAt - Date.parse(observedAt));
  const ageMinutes = Math.floor(ageMilliseconds / 60_000);
  const stale = ageMilliseconds > 90_000;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
      <Badge variant={stale ? "destructive" : "outline"}>
        {stale ? "스냅샷 지연" : "스냅샷 최신"}
      </Badge>
      <span>{ageMinutes < 1 ? "방금 관측" : `${ageMinutes}분 전 관측`}</span>
    </div>
  );
}

function refreshMessage<T>(state: ResourcesResourceState<T>, message: string): string | null {
  return state.phase === "ready" && state.refreshFailure
    ? message
    : null;
}
