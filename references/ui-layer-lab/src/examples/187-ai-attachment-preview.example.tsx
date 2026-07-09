import { useState } from "react";

const files = ["workflow.log", "screenshot.png", "diff.patch"];

export default function AiAttachmentPreviewExample() {
  const [attached, setAttached] = useState(["workflow.log"]);

  return (
    <div className="attachment-card">
      <strong>Prompt attachments</strong>
      <div className="chip-row">
        {files.map((file) => (
          <button
            className={attached.includes(file) ? "active" : ""}
            key={file}
            onClick={() => setAttached((items) => (items.includes(file) ? items.filter((item) => item !== file) : [...items, file]))}
          >
            {file}
          </button>
        ))}
      </div>
      <textarea readOnly value={`Explain the failure using: ${attached.join(", ") || "no files"}`} />
    </div>
  );
}
