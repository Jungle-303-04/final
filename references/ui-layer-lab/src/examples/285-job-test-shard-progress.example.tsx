import { useState } from "react";

const shards = ["1/4", "2/4", "3/4", "4/4"];

export default function JobTestShardProgressExample() {
  const [done, setDone] = useState(2);

  return (
    <div className="parallel-lanes">
      {shards.map((shard, index) => (
        <section aria-current={index === done - 1 ? "step" : undefined} aria-label={`테스트 샤드 ${shard} ${index < done ? "완료" : "실행 중"}`} className={index < done ? "active" : ""} key={shard}>
          <strong>샤드 {shard}</strong>
          <span>{index < done ? "완료" : "실행 중"}</span>
        </section>
      ))}
      <button className="command-trigger stable-wide" onClick={() => setDone((value) => (value >= 4 ? 1 : value + 1))} type="button">진행</button>
      <span aria-live="polite" className="brush-count">완료 {done}/4</span>
    </div>
  );
}
