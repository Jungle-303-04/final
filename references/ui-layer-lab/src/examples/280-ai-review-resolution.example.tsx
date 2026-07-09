import { useState } from "react";

const comments = ["Rename ambiguous prop", "Add empty state", "Handle failed toast"];

export default function AiReviewResolutionExample() {
  const [resolved, setResolved] = useState(["Add empty state"]);

  return (
    <div className="stack-list">
      {comments.map((comment) => (
        <button className={resolved.includes(comment) ? "active" : ""} key={comment} onClick={() => setResolved((items) => (items.includes(comment) ? items.filter((item) => item !== comment) : [...items, comment]))}>
          {comment}
        </button>
      ))}
      <span className="brush-count">{resolved.length} resolved</span>
    </div>
  );
}
