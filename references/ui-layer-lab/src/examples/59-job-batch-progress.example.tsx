import { useMemo, useState } from "react";

const initialJobs = [
  { name: "Install", done: true },
  { name: "Typecheck", done: false },
  { name: "Build", done: false },
  { name: "Browser smoke", done: false }
];

export default function JobBatchProgressExample() {
  const [jobs, setJobs] = useState(initialJobs);
  const completed = useMemo(() => jobs.filter((job) => job.done).length, [jobs]);

  function completeNext() {
    setJobs((items) => {
      const nextIndex = items.findIndex((item) => !item.done);
      return items.map((item, index) => (index === nextIndex ? { ...item, done: true } : item));
    });
  }

  return (
    <div className="batch-card">
      <div className="drawer-header">
        <strong>
          {completed}/{jobs.length} complete
        </strong>
        <button onClick={completeNext}>Advance</button>
      </div>
      <div className="progress-track">
        <div style={{ width: `${(completed / jobs.length) * 100}%` }} />
      </div>
      {jobs.map((job) => (
        <div className={`queue-row ${job.done ? "success" : ""}`} key={job.name}>
          <span>{job.name}</span>
          <strong>{job.done ? "done" : "waiting"}</strong>
        </div>
      ))}
    </div>
  );
}
