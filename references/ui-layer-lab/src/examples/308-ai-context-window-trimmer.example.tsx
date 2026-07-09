import { useState } from "react";

const sources = [
  { name: "workflow.log", tokens: 1600 },
  { name: "diff.patch", tokens: 900 },
  { name: "README.md", tokens: 700 }
];

export default function AiContextWindowTrimmerExample() {
  const [selected, setSelected] = useState(sources);
  const total = selected.reduce((sum, source) => sum + source.tokens, 0);

  return (
    <div className="resource-meter">
      <section>
        <strong>{total} context tokens</strong>
        <div className="progress-track"><div style={{ width: `${(total / 4000) * 100}%` }} /></div>
      </section>
      {selected.map((source) => <button className="row-button" key={source.name} onClick={() => setSelected((items) => items.filter((item) => item.name !== source.name))}>{source.name} - remove</button>)}
    </div>
  );
}
