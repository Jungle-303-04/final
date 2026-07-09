import { useState } from "react";

export default function AiDiffReviewExample() {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="diff-review">
      <section>
        <strong>변경 전</strong>
        <code>실행 실패. 로그를 확인하세요.</code>
      </section>
      <section className={accepted ? "accepted" : ""}>
        <strong>AI 제안</strong>
        <code>/preview가 404를 반환해 시각 스모크가 실패했습니다.</code>
      </section>
      <button className="command-trigger stable-wide" onClick={() => setAccepted(true)} type="button">
        제안 적용
      </button>
    </div>
  );
}
