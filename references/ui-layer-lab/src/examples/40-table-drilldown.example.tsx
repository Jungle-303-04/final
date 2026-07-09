import { useState } from "react";

const rows = [
  { repo: "console", run: "Deploy Preview", status: "failed", detail: "Visual smoke failed." },
  { repo: "agent", run: "Cluster Sync", status: "running", detail: "Applying manifests." },
  { repo: "gateway", run: "Build API", status: "success", detail: "Build completed." }
];

export default function TableDrilldownExample() {
  const [selected, setSelected] = useState(rows[0]);

  return (
    <div className="table-drill">
      <table>
        <thead>
          <tr>
            <th>Repo</th>
            <th>Run</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className={row.repo === selected.repo ? "active" : ""} key={row.repo} onClick={() => setSelected(row)}>
              <td>{row.repo}</td>
              <td>{row.run}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="detail-panel">
        <strong>{selected.run}</strong>
        <span>{selected.detail}</span>
      </div>
    </div>
  );
}
