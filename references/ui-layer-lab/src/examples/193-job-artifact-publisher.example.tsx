import { useState } from "react";

const artifacts = ["coverage.html", "playwright-report", "bundle-stats.json"];

export default function JobArtifactPublisherExample() {
  const [published, setPublished] = useState<string[]>([]);

  return (
    <div className="artifact-publisher">
      {artifacts.map((artifact) => (
        <button
          className={published.includes(artifact) ? "active" : ""}
          key={artifact}
          onClick={() => setPublished((items) => [...new Set([...items, artifact])])}
        >
          <span>{artifact}</span>
          <strong>{published.includes(artifact) ? "published" : "publish"}</strong>
        </button>
      ))}
    </div>
  );
}
