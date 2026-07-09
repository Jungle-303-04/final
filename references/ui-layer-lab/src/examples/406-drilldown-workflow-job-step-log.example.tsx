import { useState } from "react";

const tree = {
  workflow: ["build", "visual"],
  build: ["install", "typecheck", "bundle"],
  visual: ["capture", "compare", "upload"]
};

export default function DrilldownWorkflowJobStepLogExample() {
  const [job, setJob] = useState<keyof typeof tree>("workflow");
  const [step, setStep] = useState("build");

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {tree.workflow.map((item) => <button className="row-button" key={item} onClick={() => { setJob(item as keyof typeof tree); setStep(tree[item as keyof typeof tree][0]); }}>{item}</button>)}
        {job !== "workflow" ? tree[job].map((item) => <button className="row-button" key={item} onClick={() => setStep(item)}>{item}</button>) : null}
      </div>
      <aside className="detail-panel">
        <strong>{job} / {step}</strong>
        <span>log line: completed with status details</span>
      </aside>
    </div>
  );
}
