import { useState } from "react";

const envs = {
  preview: ["API_URL=/preview", "CACHE=warm"],
  production: ["API_URL=/prod", "CACHE=hot"]
};

export default function JobEnvironmentDiffExample() {
  const [env, setEnv] = useState<keyof typeof envs>("preview");

  return (
    <div className="compare-panel">
      <select value={env} onChange={(event) => setEnv(event.target.value as keyof typeof envs)}>
        <option value="preview">preview</option>
        <option value="production">production</option>
      </select>
      <section>
        <strong>{env}</strong>
        {envs[env].map((line) => <code key={line}>{line}</code>)}
      </section>
    </div>
  );
}
