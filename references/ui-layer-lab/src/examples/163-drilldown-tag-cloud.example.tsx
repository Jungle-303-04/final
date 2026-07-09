import { useState } from "react";

const tags = ["route", "smoke", "deploy", "docs", "agent"];

export default function DrilldownTagCloudExample() {
  const [tag, setTag] = useState("route");

  return (
    <div className="tag-cloud-card">
      <div className="chip-row">
        {tags.map((item) => (
          <button className={tag === item ? "active" : ""} key={item} onClick={() => setTag(item)}>
            {item}
          </button>
        ))}
      </div>
      <span>Filtering by {tag}</span>
    </div>
  );
}
