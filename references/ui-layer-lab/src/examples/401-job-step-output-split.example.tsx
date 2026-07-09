import { useState } from "react";

const outputs = {
  stdout: "build completed in 4.2s",
  stderr: "warning: asset size limit",
  artifacts: "dist/index.html"
};

export default function JobStepOutputSplitExample() {
  const [tab, setTab] = useState<keyof typeof outputs>("stdout");

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {Object.keys(outputs).map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item as keyof typeof outputs)}>
            {item}
          </button>
        ))}
      </div>
      <pre className="terminal-log"><code>{outputs[tab]}</code></pre>
    </div>
  );
}
