import { useState } from "react";

const logs = ["install dependencies", "run build", "visual smoke failed", "upload artifacts"];

export default function JobLogBookmarksExample() {
  const [bookmarks, setBookmarks] = useState(["visual smoke failed"]);

  return (
    <div className="live-tail">
      <pre className="terminal-log">
        {logs.map((log) => (
          <button className={bookmarks.includes(log) ? "bookmarked" : ""} key={log} onClick={() => setBookmarks((items) => (items.includes(log) ? items.filter((item) => item !== log) : [...items, log]))}>
            {log}
          </button>
        ))}
      </pre>
      <span className="brush-count">{bookmarks.length} bookmarks</span>
    </div>
  );
}
