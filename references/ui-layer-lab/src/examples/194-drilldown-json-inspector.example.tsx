import { useState } from "react";

const data = {
  workflow: { id: "deploy-preview", status: "failed" },
  job: { id: "visual-smoke", exitCode: 1 },
  step: { id: "open-page", url: "/preview" }
};

export default function DrilldownJsonInspectorExample() {
  const [key, setKey] = useState<keyof typeof data>("workflow");

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {Object.keys(data).map((item) => (
          <button className={key === item ? "row-button selected" : "row-button"} key={item} onClick={() => setKey(item as keyof typeof data)}>
            {item}
          </button>
        ))}
      </div>
      <pre className="json-detail">{JSON.stringify(data[key], null, 2)}</pre>
    </div>
  );
}
