import { useState } from "react";

const tree = {
  workflow: ["build", "visual-smoke"],
  "visual-smoke": ["open page", "capture screenshot", "compare pixels"]
};

export default function DrilldownWorkflowLogViewerExample() {
  const [job, setJob] = useState("visual-smoke");
  const [step, setStep] = useState("capture screenshot");

  return (
    <div className="column-browser">
      <div>{tree.workflow.map((item) => <button className={job === item ? "active" : ""} key={item} onClick={() => setJob(item)}>{item}</button>)}</div>
      <div>{tree["visual-smoke"].map((item) => <button className={step === item ? "active" : ""} key={item} onClick={() => setStep(item)}>{item}</button>)}</div>
      <pre className="terminal-log"><code>{job} / {step}: selected log window</code></pre>
    </div>
  );
}
