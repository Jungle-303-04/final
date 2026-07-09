import { useState } from "react";

const tools = ["파일 읽기", "패치 편집", "테스트 실행"];

export default function AiToolPermissionReviewExample() {
  const [approved, setApproved] = useState(["파일 읽기"]);

  function toggle(tool: string) {
    setApproved((items) => (items.includes(tool) ? items.filter((item) => item !== tool) : [...items, tool]));
  }

  return (
    <div className="scope-grid">
      {tools.map((tool) => <button className={approved.includes(tool) ? "active" : ""} key={tool} onClick={() => toggle(tool)} type="button">{tool}</button>)}
      <strong>승인된 도구 {approved.length}개</strong>
    </div>
  );
}
