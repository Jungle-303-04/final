import { useState } from "react";

export default function AnimatedSkeletonToContentExample() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="skeleton-swap">
      <button className="command-trigger" onClick={() => setLoaded((value) => !value)}>
        {loaded ? "Show Loading" : "Resolve"}
      </button>
      {loaded ? (
        <article className="loaded-card">
          <strong>Run summary ready</strong>
          <span>3 jobs passed, 1 warning needs review.</span>
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
