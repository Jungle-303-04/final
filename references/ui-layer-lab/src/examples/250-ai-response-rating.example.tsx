import { useState } from "react";

export default function AiResponseRatingExample() {
  const [rating, setRating] = useState("평가 전");

  return (
    <div className="ai-chat-card">
      <strong>AI 응답</strong>
      <span>실패 원인은 누락된 미리보기 경로입니다.</span>
      <div className="tool-call-actions">
        <button aria-pressed={rating === "도움 됨"} className="stable-wide" onClick={() => setRating("도움 됨")} type="button">
          도움 됨
        </button>
        <button aria-pressed={rating === "보완 필요"} className="stable-wide" onClick={() => setRating("보완 필요")} type="button">
          보완 필요
        </button>
      </div>
      <span aria-live="polite">{rating}</span>
    </div>
  );
}
