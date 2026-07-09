import { useState } from "react";

const shards = ["1/4", "2/4", "3/4", "4/4"];

export default function JobTestShardProgressExample() {
  const [done, setDone] = useState(2);

  return (
    <div className="parallel-lanes">
      {shards.map((shard, index) => (
        <section className={index < done ? "active" : ""} key={shard}>
          <strong>Shard {shard}</strong>
          <span>{index < done ? "done" : "running"}</span>
        </section>
      ))}
      <button className="command-trigger" onClick={() => setDone((value) => (value >= 4 ? 1 : value + 1))}>Advance</button>
    </div>
  );
}
