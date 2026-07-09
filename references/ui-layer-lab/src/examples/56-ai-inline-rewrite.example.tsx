import { useState } from "react";

const variants = {
  shorter: {
    label: "짧게",
    value: "/preview 제거 후 라우트 스모크가 실패했습니다."
  },
  clearer: {
    label: "명확하게",
    value: "미리보기 라우트가 없어 시각 스모크 테스트가 페이지를 열 수 없습니다."
  },
  action: {
    label: "조치",
    value: "CI를 다시 실행하기 전에 /preview를 복구하거나 스모크 테스트 대상을 갱신하세요."
  }
};

export default function AiInlineRewriteExample() {
  const [text, setText] = useState("앱 라우트가 바뀌어 브라우저가 페이지를 찾지 못했고 테스트가 실패했습니다.");

  return (
    <div className="rewrite-card">
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
      <div className="segmented-row">
        {Object.entries(variants).map(([id, option]) => (
          <button key={id} onClick={() => setText(option.value)} type="button">
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
