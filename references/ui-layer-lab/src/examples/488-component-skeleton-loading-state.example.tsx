import { useState } from "react";

export default function ComponentSkeletonLoadingStateExample() {
  const [loading, setLoading] = useState(true);

  return (
    <section className="component-demo stable-loading-demo" data-testid="skeleton-example">
      <header>
        <strong>스켈레톤 로딩 상태</strong>
        <span>데이터가 들어오기 전에도 레이아웃 높이를 유지</span>
      </header>
      <button className="component-primary stable-wide" data-stable-control="skeleton-toggle" onClick={() => setLoading((value) => !value)} type="button">
        {loading ? "결과 표시" : "로딩 표시"}
      </button>

      <div className="loading-result-shell" data-testid="skeleton-shell">
        <div className={loading ? "loading-layer is-visible" : "loading-layer"} aria-hidden={!loading}>
          <div className="stable-avatar shimmer" />
          <div className="stable-lines">
            <span className="stable-line shimmer" />
            <span className="stable-line short shimmer" />
            <span className="stable-block shimmer" />
          </div>
        </div>
        <div className={loading ? "result-layer" : "result-layer is-visible"} aria-hidden={loading}>
          <span className="status-pill">분석 완료</span>
          <strong>실패 원인 요약</strong>
          <p>실패 로그 4개 중 3개가 같은 시간 초과 원인을 공유합니다. 나머지 1개는 환경 변수 누락입니다.</p>
          <div className="result-grid">
            <span>공통 원인</span>
            <strong>3건</strong>
            <span>검토 필요</span>
            <strong>1건</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
