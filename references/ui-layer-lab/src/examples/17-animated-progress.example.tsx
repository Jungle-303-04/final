import { useEffect, useState } from "react";

export default function AnimatedProgressExample() {
  const [progress, setProgress] = useState(18);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((value) => (value >= 96 ? 18 : value + 13));
    }, 900);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="animated-progress-card">
      <div>
        <strong>git pull origin dev</strong>
        <span>원격 Mutate사항을 가져오는 중</span>
      </div>
      <div className="progress-track">
        <div style={{ width: `${progress}%` }} />
      </div>
      <em>{progress}%</em>
    </div>
  );
}
