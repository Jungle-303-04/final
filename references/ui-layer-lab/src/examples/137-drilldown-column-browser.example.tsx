import { useState } from "react";

const data = {
  workflows: ["deploy", "test"],
  deploy: ["build", "smoke"],
  test: ["unit", "e2e"],
  build: ["install", "bundle"],
  smoke: ["route", "screenshot"]
};

export default function DrilldownColumnBrowserExample() {
  const [first, setFirst] = useState("deploy");
  const [second, setSecond] = useState("smoke");

  return (
    <div className="column-browser">
      <div>
        {(data.workflows ?? []).map((item) => (
          <button className={first === item ? "active" : ""} key={item} onClick={() => setFirst(item)}>
            {item}
          </button>
        ))}
      </div>
      <div>
        {(data[first as keyof typeof data] ?? []).map((item) => (
          <button className={second === item ? "active" : ""} key={item} onClick={() => setSecond(item)}>
            {item}
          </button>
        ))}
      </div>
      <div>
        {(data[second as keyof typeof data] ?? []).map((item) => (
          <button key={item}>{item}</button>
        ))}
      </div>
    </div>
  );
}
