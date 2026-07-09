import { useState } from "react";

const tabs = {
  passed: ["auth.spec.ts", "billing.spec.ts", "workflow.spec.ts"],
  failed: ["overlay.spec.ts", "git-runner.spec.ts"],
  skipped: ["visual-regression.spec.ts"]
};

export default function ComponentTabsResultSummaryExample() {
  const [tab, setTab] = useState<keyof typeof tabs>("failed");

  return (
    <section className="component-demo">
      <header>
        <strong>결과 요약 탭</strong>
        <span>성공, 실패, 건너뜀을 같은 공간에서 전환</span>
      </header>
      <div className="component-tabs">
        {Object.keys(tabs).map((key) => (
          <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key as keyof typeof tabs)}>
            {key === "passed" ? "통과" : key === "failed" ? "실패" : "건너뜀"}
          </button>
        ))}
      </div>
      <div className="component-list">
        {tabs[tab].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
