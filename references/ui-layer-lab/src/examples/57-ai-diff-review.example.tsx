import { useState } from "react";

export default function AiDiffReviewExample() {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="diff-review">
      <section>
        <strong>Before</strong>
        <code>Run failed. Check logs.</code>
      </section>
      <section className={accepted ? "accepted" : ""}>
        <strong>AI Suggestion</strong>
        <code>Visual smoke failed because /preview returned 404.</code>
      </section>
      <button className="command-trigger" onClick={() => setAccepted(true)}>
        Accept Suggestion
      </button>
    </div>
  );
}
