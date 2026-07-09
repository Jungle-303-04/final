import { useState } from "react";

const comments = ["모호한 속성명 변경", "빈 상태 추가", "실패 토스트 처리"];

export default function AiReviewResolutionExample() {
  const [resolved, setResolved] = useState(["빈 상태 추가"]);

  return (
    <div className="stack-list">
      {comments.map((comment) => (
        <button
          aria-pressed={resolved.includes(comment)}
          className={resolved.includes(comment) ? "active" : ""}
          key={comment}
          onClick={() => setResolved((items) => (items.includes(comment) ? items.filter((item) => item !== comment) : [...items, comment]))}
          type="button"
        >
          {comment}
        </button>
      ))}
      <span aria-live="polite" className="brush-count">해결 {resolved.length}개</span>
    </div>
  );
}
