import { useState } from "react";

const logs = [
  { level: "정보", text: "빌드가 시작되었습니다" },
  { level: "경고", text: "의존성 설치가 느립니다" },
  { level: "오류", text: "라우트 스모크가 실패했습니다" },
  { level: "정보", text: "아티팩트를 업로드했습니다" }
];

const levels = ["전체", "정보", "경고", "오류"];

export default function JobLogLevelFilterExample() {
  const [level, setLevel] = useState("전체");
  const visible = level === "전체" ? logs : logs.filter((log) => log.level === level);

  return (
    <div className="log-filter-card">
      <div className="segmented-row">
        {levels.map((item) => (
          <button className={level === item ? "active" : ""} key={item} onClick={() => setLevel(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <pre className="terminal-log">
        {visible.map((log) => (
          <code key={`${log.level}-${log.text}`}>[{log.level}] {log.text}</code>
        ))}
      </pre>
    </div>
  );
}
