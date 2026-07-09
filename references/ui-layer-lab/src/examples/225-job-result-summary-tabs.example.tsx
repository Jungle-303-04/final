import { useState } from "react";

const summaries = {
  통과: "검사 18개가 통과했습니다.",
  실패: "시각 회귀 검사 1개가 실패했습니다.",
  건너뜀: "브라우저 매트릭스 작업 2개를 건너뛰었습니다."
};

export default function JobResultSummaryTabsExample() {
  const [tab, setTab] = useState<keyof typeof summaries>("실패");

  return (
    <div className="route-transition">
      <div className="segmented-row">
        {Object.keys(summaries).map((item) => (
          <button aria-pressed={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item as keyof typeof summaries)} type="button">
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
