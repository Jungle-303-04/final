import { useState } from "react";

const jobs = [
  { name: "install", depends: "none", status: "success" },
  { name: "typecheck", depends: "install", status: "success" },
  { name: "build", depends: "typecheck", status: "running" },
  { name: "smoke", depends: "build", status: "queued" }
];

export default function JobDependencyListExample() {
  const [selected, setSelected] = useState(jobs[2]);

  return (
    <div className="table-drill">
      <div className="dependency-list">
        {jobs.map((job) => (
          <button className={job.name === selected.name ? "active" : ""} key={job.name} onClick={() => setSelected(job)}>
            <strong>{job.name}</strong>
            <span>{job.status}</span>
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>depends on: {selected.depends}</span>
        <span>status: {selected.status}</span>
      </aside>
    </div>
  );
}
