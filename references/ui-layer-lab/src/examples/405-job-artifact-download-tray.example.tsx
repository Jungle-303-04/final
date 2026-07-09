import { useState } from "react";

const artifacts = ["coverage.zip", "screenshots.zip", "logs.txt"];

export default function JobArtifactDownloadTrayExample() {
  const [artifact, setArtifact] = useState(artifacts[0]);

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {artifacts.map((item) => (
          <button className={artifact === item ? "row-button selected" : "row-button"} key={item} onClick={() => setArtifact(item)}>
            {item}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{artifact}</strong>
        <button className="command-trigger">Download</button>
      </aside>
    </div>
  );
}
