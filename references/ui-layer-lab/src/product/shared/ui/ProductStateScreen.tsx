import {
  CircleAlert,
  Inbox,
  LockKeyhole,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "./primitives/alert";
import { Badge } from "./primitives/badge";
import { Button } from "./primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "./primitives/empty";
import { Skeleton } from "./primitives/skeleton";
import { Spinner } from "./primitives/spinner";

export type ProductStateKind =
  | "loading"
  | "empty"
  | "forbidden"
  | "offline"
  | "error"
  | "release";

export type ProductStateErrorCode =
  | "network"
  | "forbidden"
  | "invalid-response"
  | "server"
  | "unknown";

export interface ProductStateIssue {
  code: ProductStateErrorCode;
  safeDetail?: string;
  correlationId?: string;
}

export interface ProductStateRetry {
  label?: string;
  pending: boolean;
  onRetry: () => void;
}

type ProductStatePlacement = "root" | "content";

interface StateBase {
  placement?: ProductStatePlacement;
}

export type ProductStateScreenProps =
  | (StateBase & {
      kind: "loading";
      issue?: never;
      retry?: never;
      loadingPreview?: ReactNode;
    })
  | (StateBase & { kind: "empty"; issue?: never; retry?: never })
  | (StateBase & {
      kind: "offline";
      issue: ProductStateIssue & { code: "network" };
      retry?: ProductStateRetry;
    })
  | (StateBase & {
      kind: "error";
      issue: ProductStateIssue & {
        code: "invalid-response" | "server" | "unknown";
      };
      retry?: ProductStateRetry;
    })
  | (StateBase & {
      kind: "forbidden";
      issue: ProductStateIssue & { code: "forbidden" };
      retry?: never;
    })
  | {
      kind: "release";
      placement?: "root";
      issue?: never;
      retry?: never;
    };

const stateCopy: Record<ProductStateKind, { eyebrow: string; title: string; body: string }> = {
  loading: {
    eyebrow: "CONTROL PLANE",
    title: "운영 상태를 확인하는 중입니다",
    body: "세션과 관측 데이터의 최신 계약을 확인하고 있습니다.",
  },
  empty: {
    eyebrow: "NO DATA",
    title: "표시할 데이터가 없습니다",
    body: "현재 범위와 조건에 일치하는 데이터가 없습니다.",
  },
  forbidden: {
    eyebrow: "LIMITED ACCESS",
    title: "이 범위에 접근할 수 없습니다",
    body: "현재 계정에 필요한 조회 권한이 없습니다.",
  },
  offline: {
    eyebrow: "NO SIGNAL",
    title: "컨트롤 플레인에 연결할 수 없습니다",
    body: "합성 상태로 대체하지 않습니다. API 게이트웨이 연결을 확인하세요.",
  },
  error: {
    eyebrow: "READ MODEL ERROR",
    title: "검증된 응답을 읽지 못했습니다",
    body: "서버 오류 또는 응답 계약 불일치를 확인한 뒤 다시 시도하세요.",
  },
  release: {
    eyebrow: "RELEASE GATE",
    title: "API 연결 계층을 검증하고 있습니다",
    body: "완료 기록이 있는 endpoint만 제품에 연결합니다. 현재 화면은 서버 데이터를 요청하지 않습니다.",
  },
};

export function ProductStateScreen(props: ProductStateScreenProps) {
  const titleId = useId();
  const { kind } = props;
  const isContent = props.placement === "content";
  const copy = stateCopy[kind];
  const isLoading = kind === "loading";
  const issue = "issue" in props ? props.issue : undefined;
  const retry = "retry" in props ? props.retry : undefined;
  const loadingPreview = props.kind === "loading" ? props.loadingPreview : undefined;
  const issueKind = isIssueStateKind(kind) ? kind : null;
  const content = (
    <Empty className="w-full max-w-lg items-start rounded-xl border border-solid bg-card p-8 text-left text-card-foreground shadow-sm">
      <Badge variant="outline">{copy.eyebrow}</Badge>
      <EmptyMedia className="mt-4" variant="icon">
        <StateIcon kind={kind} />
      </EmptyMedia>
      <EmptyHeader className="max-w-none items-start text-left">
        <StateHeading level={isContent ? 2 : 1} titleId={titleId}>{copy.title}</StateHeading>
        <EmptyDescription className="text-pretty leading-6">{copy.body}</EmptyDescription>
      </EmptyHeader>
      {isLoading ? (loadingPreview ?? <LoadingPreview />) : null}
      {issue && issueKind ? <IssueAlert issue={issue} kind={issueKind} /> : null}
      {retry ? <RetryAction retry={retry} /> : null}
    </Empty>
  );

  if (props.placement === "content") {
    return (
      <section
        aria-busy={isLoading || undefined}
        aria-labelledby={titleId}
        className="grid min-h-full place-items-center bg-background p-6 text-foreground"
        tabIndex={-1}
      >
        {content}
      </section>
    );
  }

  return (
    <main
      aria-busy={isLoading || undefined}
      aria-labelledby={titleId}
      className="grid min-h-svh place-items-center bg-background p-6 text-foreground"
      id="product-main"
      tabIndex={-1}
    >
      {content}
    </main>
  );
}

function StateIcon({ kind }: { kind: ProductStateKind }) {
  if (kind === "loading") return <Spinner />;
  const iconByKind: Record<Exclude<ProductStateKind, "loading">, ReactNode> = {
    empty: <Inbox aria-hidden="true" />,
    forbidden: <LockKeyhole aria-hidden="true" />,
    offline: <WifiOff aria-hidden="true" />,
    error: <CircleAlert aria-hidden="true" />,
    release: <ShieldCheck aria-hidden="true" />,
  };
  return iconByKind[kind];
}

function StateHeading({
  children,
  level,
  titleId,
}: {
  children: ReactNode;
  level: 1 | 2;
  titleId: string;
}) {
  const className = "text-balance text-2xl font-semibold tracking-tight";
  return level === 1
    ? <h1 className={className} id={titleId}>{children}</h1>
    : <h2 className={className} id={titleId}>{children}</h2>;
}

function LoadingPreview() {
  return (
    <EmptyContent aria-hidden="true" className="mt-2 max-w-none items-stretch">
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </EmptyContent>
  );
}

function isIssueStateKind(kind: ProductStateKind): kind is "forbidden" | "offline" | "error" {
  return kind === "forbidden" || kind === "offline" || kind === "error";
}

function IssueAlert({
  issue,
  kind,
}: {
  issue: ProductStateIssue;
  kind: "forbidden" | "offline" | "error";
}) {
  const title = kind === "forbidden"
    ? "권한 정보"
    : kind === "offline"
      ? "연결 오류"
      : "응답 오류";

  return (
    <Alert className="mt-2" variant={kind === "error" ? "destructive" : "default"}>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="flex flex-wrap gap-x-2">
          <span>오류 코드</span>
          <code className="font-mono text-xs">{issue.code}</code>
        </p>
        {issue.safeDetail ? <p className="break-words [overflow-wrap:anywhere]">{issue.safeDetail}</p> : null}
        {issue.correlationId ? (
          <p className="flex flex-wrap gap-x-2">
            <span>상관 ID</span>
            <code className="break-all font-mono text-xs">{issue.correlationId}</code>
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function RetryAction({ retry }: { retry: ProductStateRetry }) {
  const invokedRef = useRef(false);
  const label = retry.label?.trim() || "다시 시도";

  useEffect(() => {
    if (!retry.pending) invokedRef.current = false;
  }, [retry.pending]);

  const handleRetry = () => {
    if (retry.pending || invokedRef.current) return;
    invokedRef.current = true;
    retry.onRetry();
  };

  return (
    <EmptyContent className="mt-2 items-start">
      <Button aria-busy={retry.pending || undefined} disabled={retry.pending} onClick={handleRetry}>
        {retry.pending ? <Spinner data-icon="inline-start" decorative /> : null}
        {retry.pending ? `${label} 중` : label}
      </Button>
    </EmptyContent>
  );
}
