import { useState } from "react";

const jobs = ["Git 갱신", "타입 검사", "프리뷰 빌드"];

export default function JobTopLayerTrayExample() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fake-page">
      <strong>앱 작업 공간</strong>
      <p>상단 트레이가 백그라운드 작업의 진행 상태를 설명합니다.</p>
      <section className={`top-job-tray ${expanded ? "expanded" : ""}`}>
        <button onClick={() => setExpanded((value) => !value)} type="button">
          실행 중인 작업 3개
        </button>
        {expanded ? jobs.map((job) => <span key={job}>{job}</span>) : null}
      </section>
    </div>
  );
}
