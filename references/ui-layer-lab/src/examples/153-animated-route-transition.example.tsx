import { useState } from "react";

const pages = ["Runs", "Logs", "Diff"];

export default function AnimatedRouteTransitionExample() {
  const [page, setPage] = useState("Runs");

  return (
    <div className="route-transition">
      <div className="segmented-row">
        {pages.map((item) => (
          <button className={page === item ? "active" : ""} key={item} onClick={() => setPage(item)}>
            {item}
          </button>
        ))}
      </div>
      <section key={page}>
        <strong>{page}</strong>
        <span>{page} view is now active.</span>
      </section>
    </div>
  );
}
