import { useState } from "react";

const outputs = {
  stdout: "Build completed in 38s.",
  stderr: "warning: bundle chunk is large.",
  artifacts: "dist/index.html, report.json"
};

export default function JobStepOutputTabsExample() {
  const [tab, setTab] = useState<keyof typeof outputs>("stdout");

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {Object.keys(outputs).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item as keyof typeof outputs)}>{item}</button>)}
      </div>
      <pre className="terminal-log"><code>{outputs[tab]}</code></pre>
    </div>
  );
}
