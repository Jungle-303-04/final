const resources = [
  { name: "CPU", value: 72 },
  { name: "Memory", value: 48 },
  { name: "Network", value: 61 }
];

export default function JobResourceMeterExample() {
  return (
    <div className="resource-meter">
      {resources.map((resource) => (
        <section key={resource.name}>
          <strong>{resource.name}</strong>
          <div className="progress-track">
            <div style={{ width: `${resource.value}%` }} />
          </div>
          <span>{resource.value}%</span>
        </section>
      ))}
    </div>
  );
}
