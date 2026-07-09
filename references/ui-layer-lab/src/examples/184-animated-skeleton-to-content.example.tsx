import { useState } from "react";

export default function AnimatedSkeletonToContentExample() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="skeleton-swap">
      <button className="command-trigger stable-wide" onClick={() => setLoaded((value) => !value)} type="button">
        {loaded ? "로딩 표시" : "결과 표시"}
      </button>
      <div className="skeleton-swap-frame" data-state={loaded ? "loaded" : "loading"}>
        <div aria-hidden={loaded} className={loaded ? "skeleton-layer" : "skeleton-layer is-visible"}>
          <div className="skeleton-card">
            <div className="skeleton-avatar shimmer" />
            <div className="skeleton-lines">
              <div className="skeleton-line shimmer" />
              <div className="skeleton-line short shimmer" />
              <div className="skeleton-block shimmer" />
            </div>
          </div>
        </div>
        <article aria-hidden={!loaded} className={loaded ? "loaded-card skeleton-layer is-visible" : "loaded-card skeleton-layer"}>
          <strong>실행 요약 준비됨</strong>
          <span>작업 3개 통과, 경고 1개 검토 필요.</span>
          <span>레이아웃 높이는 로딩 상태와 동일하게 유지됩니다.</span>
        </article>
      </div>
    </div>
  );
}
