import { useMemo, useState } from "react";

const logs = [
  "install completed",
  "typecheck completed",
  "visual smoke failed",
  "route /preview returned 404",
  "screenshot compare skipped"
];

export default function DrilldownLogSearchExample() {
  const [query, setQuery] = useState("preview");
  const results = useMemo(() => logs.filter((line) => line.includes(query.toLowerCase())), [query]);

  return (
    <div className="drill-grid">
      <div className="drawer">
        <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} />
        {results.map((line) => (
          <button className="row-button" key={line}>
            {line}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{results.length} matching lines</strong>
        <span>Search stays inside the selected job context.</span>
      </aside>
    </div>
  );
}
