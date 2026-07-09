import { useState } from "react";

const comments = [
  { file: "router.tsx", body: "Route removal breaks visual smoke." },
  { file: "smoke.spec.ts", body: "Update expected path if route was renamed." }
];

export default function AiReviewCommentsExample() {
  const [comment, setComment] = useState(comments[0]);

  return (
    <div className="table-drill">
      <div className="drawer">
        {comments.map((item) => (
          <button className="row-button" key={item.file} onClick={() => setComment(item)}>
            {item.file}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{comment.file}</strong>
        <span>{comment.body}</span>
      </aside>
    </div>
  );
}
