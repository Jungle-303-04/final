import { useEffect, useState } from "react";

const lines = ["fetch origin", "resolve packages", "typecheck src", "build chunks", "start smoke test"];

export default function JobLiveTailExample() {
  const [visible, setVisible] = useState(lines.slice(0, 2));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisible((items) => lines.slice(0, Math.min(items.length + 1, lines.length)));
    }, 700);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <pre className="terminal-log live-tail">
      {visible.map((line) => (
        <code key={line}>$ {line}</code>
      ))}
    </pre>
  );
}
