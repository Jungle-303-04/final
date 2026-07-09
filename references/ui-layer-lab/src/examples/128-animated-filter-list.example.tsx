import { useState } from "react";

const rows = [
  { name: "visual-smoke", status: "failed" },
  { name: "typecheck", status: "success" },
  { name: "build", status: "running" }
];

export default function AnimatedFilterListExample() {
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? rows : rows.filter((row) => row.status === filter);

  return (
    <div className="animated-filter-list">
      <div className="segmented-row">
        {["all", "failed", "running", "success"].map((item) => (
          <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      {visible.map((row) => (
        <div className="filter-row" key={row.name}>
          <strong>{row.name}</strong>
          <span>{row.status}</span>
        </div>
      ))}
    </div>
  );
}
