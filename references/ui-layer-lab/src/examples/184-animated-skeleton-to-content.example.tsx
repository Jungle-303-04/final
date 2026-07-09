import { useState } from "react";

export default function AnimatedSkeletonToContentExample() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="skeleton-swap">
      <button className="command-trigger stable-wide" onClick={() => setLoaded((value) => !value)} type="button">
        {loaded ? "로딩 표시" : "결과 표시"}
      </button>
      {loaded ? (
        <article className="loaded-card">
          <strong>실행 요약 준비됨</strong>
          <span>작업 3개 통과, 경고 1개 검토 필요.</span>
        </article>
      ) : (
        <div className="skeleton-card">
          <div className="skeleton-avatar shimmer" />
          <div className="skeleton-lines">
            <div className="skeleton-line shimmer" />
            <div className="skeleton-line short shimmer" />
            <div className="skeleton-block shimmer" />
          </div>
        </div>
      )}
    </div>
  );
}
