import { useState } from "react";

export default function AnimatedStatusRibbonExample() {
  const [live, setLive] = useState(false);

  return (
    <div className={live ? "ribbon-card live" : "ribbon-card"}>
      <span>{live ? "LIVE" : "IDLE"}</span>
      <strong>Preview environment</strong>
      <button className="command-trigger" onClick={() => setLive((value) => !value)}>Toggle</button>
    </div>
  );
}
