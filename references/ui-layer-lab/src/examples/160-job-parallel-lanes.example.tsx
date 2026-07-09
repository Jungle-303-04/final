const lanes = [
  { name: "frontend", jobs: ["install", "build", "smoke"] },
  { name: "backend", jobs: ["lint", "test", "package"] },
  { name: "agent", jobs: ["sync", "verify"] }
];

export default function JobParallelLanesExample() {
  return (
    <div className="parallel-lanes">
      {lanes.map((lane) => (
        <section key={lane.name}>
          <strong>{lane.name}</strong>
          {lane.jobs.map((job) => (
            <span key={job}>{job}</span>
          ))}
        </section>
      ))}
    </div>
  );
}
