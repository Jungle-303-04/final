export function ProductStateScreen({ kind, error, onRetry }: {
  kind: "loading" | "offline" | "error";
  error?: string;
  onRetry?: () => void;
}) {
  const copy = {
    loading: { eyebrow: "CONTROL PLANE", title: "운영 상태를 확인하는 중입니다", body: "세션과 관측 데이터의 최신 계약을 확인하고 있습니다." },
    offline: { eyebrow: "NO SIGNAL", title: "컨트롤 플레인에 연결할 수 없습니다", body: "합성된 상태를 대신 보여주지 않습니다. API 게이트웨이 상태를 확인한 뒤 다시 시도하세요." },
    error: { eyebrow: "READ MODEL ERROR", title: "Fleet read model을 읽지 못했습니다", body: "서버가 반환한 오류를 확인하고 다시 시도하세요." },
  }[kind];

  return (
    <div className="state-screen">
      <section className="state-screen__panel" aria-live="polite">
        <span className="eyebrow">{copy.eyebrow}</span>
        <div className="state-screen__signal" data-state={kind} aria-hidden="true" />
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {error ? <code className="state-screen__error">{error}</code> : null}
        {onRetry ? <button className="button button--primary" type="button" onClick={onRetry}>다시 시도</button> : null}
      </section>
    </div>
  );
}
