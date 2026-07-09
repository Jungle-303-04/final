import { useState } from "react";

const jobs = ["build", "test", "deploy", "smoke"];

export default function JobConcurrencyLimitExample() {
  const [limit, setLimit] = useState(2);

  return (
    <div className="parallel-lanes">
      {jobs.map((job, index) => (
        <section className={index < limit ? "active" : ""} key={job}>
          <strong>{job}</strong>
          <span>{index < limit ? "running" : "queued"}</span>
        </section>
      ))}
      <button className="command-trigger" onClick={() => setLimit((value) => (value === 2 ? 3 : 2))}>Toggle Limit</button>
    </div>
  );
}
