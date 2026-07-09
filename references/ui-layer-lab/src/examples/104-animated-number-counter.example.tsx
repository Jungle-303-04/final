import { useEffect, useState } from "react";

export default function AnimatedNumberCounterExample() {
  const [value, setValue] = useState(24);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setValue((current) => (current >= 100 ? 24 : current + 4));
    }, 160);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="counter-card">
      <strong>{value}%</strong>
      <div className="progress-track">
        <div style={{ width: `${value}%` }} />
      </div>
      <span>Build progress</span>
    </div>
  );
}
