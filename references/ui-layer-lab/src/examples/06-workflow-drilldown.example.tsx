import { useMemo, useState } from "react";
const run = {
  jobs: [
    {
      id: "build",
      name: "Build frontend",
      steps: [
        { id: "checkout", name: "Checkout", status: "success", logs: ["checked out branch"] },
        { id: "bundle", name: "Bundle", status: "success", logs: ["vite build complete"] }
      ]
    },
    {
      id: "checks",
      name: "Quality checks",
      steps: [
        { id: "typecheck", name: "Typecheck", status: "success", logs: ["tsc passed"] },
        { id: "visual", name: "Visual smoke", status: "failed", logs: ["route /dev/ui-layer-lab not found"] }
      ]
    }
  ]
};

export default function WorkflowDrilldownExample() {
  const [jobId, setJobId] = useState("checks");
  const [stepId, setStepId] = useState("visual");
  const job = useMemo(() => run.jobs.find((item) => item.id === jobId) ?? run.jobs[0], [jobId]);
  const step = useMemo(() => job.steps.find((item) => item.id === stepId) ?? job.steps[0], [job, stepId]);

  return (
    <div className="drill-grid">
      <div>
        <h3>Jobs</h3>
        {run.jobs.map((item) => (
          <button
            className={item.id === job.id ? "selected row-button" : "row-button"}
            key={item.id}
            onClick={() => {
              setJobId(item.id);
              setStepId(item.steps[0].id);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div>
        <h3>Steps</h3>
        {job.steps.map((item) => (
          <button
            className={item.id === step.id ? "selected row-button" : "row-button"}
            key={item.id}
            onClick={() => setStepId(item.id)}
          >
            {item.name} · {item.status}
          </button>
        ))}
      </div>
      <pre className="terminal-log">
        {step.logs.map((line) => (
          <code key={line}>{line}</code>
        ))}
      </pre>
    </div>
  );
}
