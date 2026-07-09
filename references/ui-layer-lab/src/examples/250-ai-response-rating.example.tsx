import { useState } from "react";

export default function AiResponseRatingExample() {
  const [rating, setRating] = useState("Not rated");

  return (
    <div className="ai-chat-card">
      <strong>AI answer</strong>
      <span>The failure is caused by a missing preview route.</span>
      <div className="tool-call-actions">
        <button onClick={() => setRating("Helpful")}>Helpful</button>
        <button onClick={() => setRating("Needs work")}>Needs work</button>
      </div>
      <span>{rating}</span>
    </div>
  );
}
