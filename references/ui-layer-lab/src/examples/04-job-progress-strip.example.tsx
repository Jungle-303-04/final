import { useEffect, useState } from "react";
export default function JobProgressStripExample() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 100) {
          window.clearInterval(timer);
          setRunning(false);
          return 100;
        }
        return value + 5;
      });
    }, 350);
    return () => window.clearInterval(timer);
  }, [running]);

  function start() {
    setProgress(0);
    setRunning(true);
  }

  return (
    <div className="example-stack">
      {running ? (
        <div className="job-strip">
          <span>git pull origin dev</span>
          <div className="progress-track">
            <div style={{ width: `${progress}%` }} />
          </div>
          <strong>{progress}%</strong>
        </div>
      ) : null}
      <button className="primary-button stable-wide" onClick={start} type="button">
        Git 가져오기 시작
      </button>
    </div>
  );
}
