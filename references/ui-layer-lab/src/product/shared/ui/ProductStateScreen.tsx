import { Badge } from "./primitives/badge";
import { Button } from "./primitives/button";

type ProductStateKind = "loading" | "offline" | "error" | "release";

const stateCopy: Record<ProductStateKind, { eyebrow: string; title: string; body: string }> = {
  loading: {
    eyebrow: "CONTROL PLANE",
    title: "운영 상태를 확인하는 중입니다",
    body: "세션과 관측 데이터의 최신 계약을 확인하고 있습니다.",
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

export function ProductStateScreen({ kind, error, onRetry }: {
  kind: ProductStateKind;
  error?: string;
  onRetry?: () => void;
}) {
  const copy = stateCopy[kind];

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground" id="product-main">
      <section className="w-full max-w-lg rounded-xl border bg-card p-8 text-card-foreground shadow-sm" aria-live="polite">
        <Badge variant="outline">{copy.eyebrow}</Badge>
        <div className="my-8 size-10 rounded-full border bg-muted" data-state={kind} aria-hidden="true" />
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground">{copy.body}</p>
        {error ? (
          <code className="mt-5 block max-h-36 overflow-auto rounded-lg border bg-muted p-3 text-xs text-destructive">
            {error}
          </code>
        ) : null}
        {onRetry ? <Button className="mt-6" onClick={onRetry}>다시 시도</Button> : null}
      </section>
    </main>
  );
}
