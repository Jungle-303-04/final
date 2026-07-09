import { useState } from "react";

const tools = ["read files", "edit patch", "run tests"];

export default function AiToolPermissionReviewExample() {
  const [approved, setApproved] = useState(["read files"]);

  function toggle(tool: string) {
    setApproved((items) => (items.includes(tool) ? items.filter((item) => item !== tool) : [...items, tool]));
  }

  return (
    <div className="scope-grid">
      {tools.map((tool) => <button className={approved.includes(tool) ? "active" : ""} key={tool} onClick={() => toggle(tool)}>{tool}</button>)}
      <strong>{approved.length} tools approved</strong>
    </div>
  );
}
