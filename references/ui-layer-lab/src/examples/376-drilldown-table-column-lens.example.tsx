import { useState } from "react";

const columns = {
  status: "failed rows are highlighted",
  owner: "owners are grouped by team",
  duration: "duration is p95 sorted"
};

export default function DrilldownTableColumnLensExample() {
  const [column, setColumn] = useState<keyof typeof columns>("status");

  return (
    <div className="column-browser">
      <div>{Object.keys(columns).map((item) => <button className={column === item ? "active" : ""} key={item} onClick={() => setColumn(item as keyof typeof columns)}>{item}</button>)}</div>
      <div><strong>{column}</strong><span>{columns[column]}</span></div>
    </div>
  );
}
