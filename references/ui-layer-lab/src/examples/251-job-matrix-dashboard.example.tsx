import { useState } from "react";

const rows = ["mac", "linux", "windows"];
const cols = ["nodes18", "nodes20", "nodes22"];

export default function JobMatrixDashboardExample() {
  const [cell, setCell] = useState("linux/nodes20");

  return (
    <div className="matrix-dashboard">
      {rows.map((row) => cols.map((col) => (
        <button className={cell === `${row}/${col}` ? "active" : ""} key={`${row}-${col}`} onClick={() => setCell(`${row}/${col}`)}>
          {row}<span>{col}</span>
        </button>
      )))}
      <strong>{cell}</strong>
    </div>
  );
}
