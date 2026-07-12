import { CircleAlert, RefreshCw } from "lucide-react";
import type { HomePortFailure } from "../../features/home/homeContract";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { Skeleton } from "../../shared/ui/primitives/skeleton";

export function HomeSectionLoading({ label }: { label: string }) {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="grid gap-2 p-4 md:grid-cols-2"
      role="status"
    >
      <span className="sr-only">{label}을 불러오는 중입니다.</span>
      <Skeleton aria-hidden="true" className="h-28" />
      <Skeleton aria-hidden="true" className="h-28" />
    </div>
  );
}

export function HomeSectionFailure({
  failure,
  label,
  onRetry,
}: {
  failure: HomePortFailure;
  label: string;
  onRetry: () => void;
}) {
  const copy = failureCopy(failure, label);
  return (
    <Alert className="m-4 w-auto" variant={failure.code === "forbidden" ? "default" : "destructive"}>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />새로 고침
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function HomeRefreshFailure({
  failure,
  label,
  onRetry,
}: {
  failure: HomePortFailure | null;
  label: string;
  onRetry: () => void;
}) {
  if (!failure) return null;
  const copy = failureCopy(failure, label);
  return (
    <Alert className="m-4 mb-0 w-auto">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>마지막 성공 응답을 표시합니다</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />새로 고침
        </Button>
      </AlertAction>
    </Alert>
  );
}

function failureCopy(failure: HomePortFailure, label: string) {
  if (failure.code === "forbidden") {
    return { title: "조회 권한이 없습니다", description: `${label}을 볼 권한이 없습니다.` };
  }
  if (failure.code === "rate-limited") {
    const retry = failure.retryAfterSeconds === null
      ? "잠시 후 다시 시도하세요."
      : `${failure.retryAfterSeconds}초 후 다시 시도하세요.`;
    return { title: "요청이 제한되었습니다", description: `${label} 요청이 제한되었습니다. ${retry}` };
  }
  if (failure.code === "not-found") {
    return {
      title: "조회 대상을 찾을 수 없습니다",
      description: `${label}을 현재 조회 범위에서 찾을 수 없습니다.`,
    };
  }
  if (failure.code === "offline") {
    return { title: "연결이 끊겼습니다", description: `${label}을 불러오는 동안 연결이 끊겼습니다.` };
  }
  if (failure.code === "invalid-response") {
    return { title: "응답을 해석할 수 없습니다", description: `${label} 응답 형식을 확인할 수 없습니다.` };
  }
  return { title: "정보를 불러오지 못했습니다", description: `${label}을 불러오지 못했습니다.` };
}
