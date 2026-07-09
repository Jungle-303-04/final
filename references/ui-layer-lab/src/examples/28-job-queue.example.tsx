import { useState } from "react";

const initialJobs = [
  { id: "pull", label: "git pull origin dev", status: "running" },
  { id: "push", label: "git push preview", status: "queued" },
  { id: "sync", label: "cluster sync", status: "queued" }
];

export default function JobQueueExample() {
  const [jobs, setJobs] = useState(initialJobs);

  function completeFirst() {
    setJobs((items) =>
      items.map((job, index) =>
        index === 0
          ? { ...job, status: "success" }
          : index === 1
            ? { ...job, status: "running" }
            : job
      )
    );
  }

  return (
    <div className="queue-card">
      {jobs.map((job) => (
        <div className={`queue-row ${job.status}`} key={job.id}>
          <span>{job.label}</span>
          <strong>{job.status}</strong>
        </div>
      ))}
      <button className="command-trigger" onClick={completeFirst}>
        Complete first job
      </button>
    </div>
  );
}
