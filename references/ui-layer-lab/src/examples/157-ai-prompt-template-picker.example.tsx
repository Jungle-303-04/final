import { useState } from "react";

const templates = {
  debug: "Find the failing step and explain the root cause.",
  patch: "Suggest the smallest safe code patch.",
  release: "Summarize this run for release notes."
};

export default function AiPromptTemplatePickerExample() {
  const [template, setTemplate] = useState<keyof typeof templates>("debug");

  return (
    <div className="template-picker">
      <select value={template} onChange={(event) => setTemplate(event.target.value as keyof typeof templates)}>
        {Object.keys(templates).map((key) => (
          <option key={key}>{key}</option>
        ))}
      </select>
      <textarea value={templates[template]} readOnly />
    </div>
  );
}
