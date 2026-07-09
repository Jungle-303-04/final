import { useState } from "react";

const logs = ["의존성 설치", "빌드 실행", "시각 회귀 실패", "아티팩트 업로드"];

export default function JobLogBookmarksExample() {
  const [bookmarks, setBookmarks] = useState(["시각 회귀 실패"]);

  return (
    <div className="live-tail">
      <pre className="terminal-log">
        {logs.map((log) => (
          <button
            aria-pressed={bookmarks.includes(log)}
            className={bookmarks.includes(log) ? "bookmarked" : ""}
            key={log}
            onClick={() => setBookmarks((items) => (items.includes(log) ? items.filter((item) => item !== log) : [...items, log]))}
            type="button"
          >
            {log}
          </button>
        ))}
      </pre>
      <span className="brush-count">북마크 {bookmarks.length}개</span>
    </div>
  );
}
