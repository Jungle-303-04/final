import { useState } from "react";

const runs = ["deploy-preview", "cluster-sync", "visual-smoke"];

export default function MasterDetailEmptyExample() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="table-drill">
      <div className="drawer">
        {runs.map((run) => (
          <button className="row-button" key={run} onClick={() => setSelected(run)}>
            {run}
          </button>
        ))}
      </div>
      <aside className="detail-panel empty-detail">
        {selected ? (
          <>
            <strong>{selected}</strong>
            <span>Selected run details appear here.</span>
          </>
        ) : (
          <>
            <strong>Select a run</strong>
            <span>The detail panel stays useful before selection.</span>
          </>
        )}
      </aside>
    </div>
  );
}
