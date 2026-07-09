import { useMemo, useState } from "react";

const items = ["의존성 설치", "타입 검사", "빌드", "스모크 테스트"];

export default function ComponentProgressChecklistExample() {
  const [done, setDone] = useState(["의존성 설치", "타입 검사"]);
  const progress = useMemo(() => Math.round((done.length / items.length) * 100), [done.length]);

  return (
    <section className="component-demo">
      <header>
        <strong>진행률 체크리스트</strong>
        <span>단계별 완료 여부와 전체 퍼센트를 동시에 표시</span>
      </header>
      <div className="component-progress">
        <span>{progress}%</span>
        <div><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="component-list">
        {items.map((item) => (
          <button
            className={done.includes(item) ? "selected" : ""}
            key={item}
            onClick={() => setDone((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}
