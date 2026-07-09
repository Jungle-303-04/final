import { useState } from "react";

const data = {
  root: ["배포", "검사"],
  배포: ["빌드", "스모크"],
  검사: ["단위 검사", "E2E 검사"],
  빌드: ["의존성 설치", "번들 생성"],
  스모크: ["경로 확인", "스크린샷 확인"],
  "단위 검사": ["유틸 검사", "컴포넌트 검사"],
  "E2E 검사": ["로그인 흐름", "배포 흐름"]
};

export default function DrilldownColumnBrowserExample() {
  const [first, setFirst] = useState("배포");
  const [second, setSecond] = useState("스모크");

  function selectFirst(item: string) {
    setFirst(item);
    setSecond(data[item as keyof typeof data][0]);
  }

  return (
    <div className="column-browser">
      <div>
        {data.root.map((item) => (
          <button aria-pressed={first === item} className={first === item ? "active" : ""} key={item} onClick={() => selectFirst(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <div>
        {(data[first as keyof typeof data] ?? []).map((item) => (
          <button aria-pressed={second === item} className={second === item ? "active" : ""} key={item} onClick={() => setSecond(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <div>
        {(data[second as keyof typeof data] ?? []).map((item) => (
          <button disabled key={item} type="button">
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
