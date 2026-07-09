import { useState } from "react";

const rows = [
  { name: "시각 스모크", status: "실패" },
  { name: "타입 검사", status: "성공" },
  { name: "빌드", status: "실행 중" }
];

const filters = ["전체", "실패", "실행 중", "성공"];

export default function AnimatedFilterListExample() {
  const [filter, setFilter] = useState("전체");
  const visible = filter === "전체" ? rows : rows.filter((row) => row.status === filter);

  return (
    <div className="animated-filter-list">
      <div className="segmented-row">
        {filters.map((item) => (
          <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">
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
