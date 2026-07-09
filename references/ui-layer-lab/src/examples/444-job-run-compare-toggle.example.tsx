import { useState } from "react";

const runs = {
  현재: ["타입 검사 통과", "빌드 실패"],
  이전: ["타입 검사 통과", "빌드 통과"]
};

export default function JobRunCompareToggleExample() {
  const [run, setRun] = useState<keyof typeof runs>("현재");

  return (
    <div className="compare-panel">
      {Object.keys(runs).map((item) => (
        <section key={item}>
          <button className="command-trigger stable-wide" onClick={() => setRun(item as keyof typeof runs)} type="button">{item}</button>
          {runs[item as keyof typeof runs].map((line) => <span key={line}>{line}</span>)}
        </section>
      ))}
      <strong>{run} 실행 선택됨</strong>
    </div>
  );
}
