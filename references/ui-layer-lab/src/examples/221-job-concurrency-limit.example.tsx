import { useState } from "react";

const jobs = ["빌드", "테스트", "배포", "스모크"];

export default function JobConcurrencyLimitExample() {
  const [limit, setLimit] = useState(2);

  return (
    <div className="parallel-lanes">
      {jobs.map((job, index) => (
        <section className={index < limit ? "active" : ""} key={job}>
          <strong>{job}</strong>
          <span>{index < limit ? "실행 중" : "대기 중"}</span>
        </section>
      ))}
      <button className="command-trigger stable-wide" onClick={() => setLimit((value) => (value === 2 ? 3 : 2))} type="button">동시 실행 전환</button>
    </div>
  );
}
