import { useState } from "react";

const files = ["workflow.log", "screenshot.png", "diff.patch"];

const fileLabels: Record<string, string> = {
  "workflow.log": "워크플로 로그",
  "screenshot.png": "스크린샷",
  "diff.patch": "변경 패치"
};

export default function AiAttachmentPreviewExample() {
  const [attached, setAttached] = useState(["workflow.log"]);

  return (
    <div className="attachment-card">
      <strong>프롬프트 첨부</strong>
      <div className="chip-row">
        {files.map((file) => (
          <button
            aria-pressed={attached.includes(file)}
            className={attached.includes(file) ? "active" : ""}
            key={file}
            onClick={() => setAttached((items) => (items.includes(file) ? items.filter((item) => item !== file) : [...items, file]))}
            type="button"
          >
            {fileLabels[file]}
          </button>
        ))}
      </div>
      <textarea readOnly value={`다음 첨부를 근거로 실패를 설명하세요: ${attached.map((file) => fileLabels[file]).join(", ") || "첨부 없음"}`} />
    </div>
  );
}
