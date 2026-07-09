import { useState } from "react";

const jobs = ["git pull", "typecheck", "preview build"];

export default function JobTopLayerTrayExample() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fake-page">
      <strong>App workspace</strong>
      <p>Top-level tray explains background work.</p>
      <section className={`top-job-tray ${expanded ? "expanded" : ""}`}>
        <button onClick={() => setExpanded((value) => !value)}>3 running jobs</button>
        {expanded ? jobs.map((job) => <span key={job}>{job}</span>) : null}
      </section>
    </div>
  );
}
