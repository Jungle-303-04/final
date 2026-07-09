import { useState } from "react";

export default function JobArtifactExpiryWarningExample() {
  const [days, setDays] = useState(3);

  return (
    <div className={days <= 1 ? "pause-card paused" : "pause-card"}>
      <strong>보관 만료 {days}일 전</strong>
      <span>아티팩트 보관 기간 경고</span>
      <button className="command-trigger stable-wide" onClick={() => setDays((value) => Math.max(0, value - 1))} type="button">하루 경과</button>
    </div>
  );
}
