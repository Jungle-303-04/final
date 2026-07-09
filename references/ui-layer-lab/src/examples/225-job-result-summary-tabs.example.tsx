import { useState } from "react";

const summaries = {
  Passed: "18 checks passed.",
  Failed: "1 visual smoke check failed.",
  Skipped: "2 browser matrix jobs skipped."
};

export default function JobResultSummaryTabsExample() {
  const [tab, setTab] = useState<keyof typeof summaries>("Failed");

  return (
    <div className="route-transition">
      <div className="segmented-row">
        {Object.keys(summaries).map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item as keyof typeof summaries)}>
            {item}
          </button>
        ))}
      </div>
      <section>
        <strong>{tab}</strong>
        <span>{summaries[tab]}</span>
      </section>
    </div>
  );
}
