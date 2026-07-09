import { useState } from "react";

export default function JobWorkerPoolDrainExample() {
  const [workers, setWorkers] = useState(6);

  return (
    <div className="resource-meter">
      <section>
        <strong>{workers} active workers</strong>
        <div className="progress-track"><div style={{ width: `${workers * 12}%` }} /></div>
      </section>
      <button className="command-trigger" onClick={() => setWorkers((value) => Math.max(0, value - 2))}>Drain Pool</button>
    </div>
  );
}
