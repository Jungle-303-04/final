import { useState } from "react";

const branches = ["기본 답변", "디버그 경로", "짧은 요약"];

export default function AiConversationBranchPickerExample() {
  const [branch, setBranch] = useState(branches[0]);

  return (
    <div className="sidecar-tabs">
      <div className="animated-tabs-list">
        {branches.map((item) => <button className={branch === item ? "active" : ""} key={item} onClick={() => setBranch(item)}>{item}</button>)}
      </div>
      <div className="animated-tab-panel">
        <strong>{branch}</strong>
        <span>선택한 답변 흐름을 고정합니다.</span>
      </div>
    </div>
  );
}
