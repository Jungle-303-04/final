import { useState } from "react";

const versions = ["summary-v1", "summary-v2", "patch-v1"];

export default function AiArtifactVersionCompareExample() {
  const [version, setVersion] = useState("summary-v2");

  return (
    <div className="version-compare">
      <div>
        {versions.map((item) => <button className={version === item ? "active" : ""} key={item} onClick={() => setVersion(item)}>{item}</button>)}
      </div>
      <section>
        <strong>{version}</strong>
        <span>{version.includes("v2") ? "Adds test evidence and risk notes." : "Earlier artifact kept for comparison."}</span>
      </section>
    </div>
  );
}
