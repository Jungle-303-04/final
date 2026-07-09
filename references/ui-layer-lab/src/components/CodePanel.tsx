import { useEffect, useState } from "react";
import { Button } from "./primitives/Button";
import { StableTextSlot } from "./primitives/StableTextSlot";

export function CodePanel({ loadSource, open, onToggle }: { loadSource: () => Promise<string>; open: boolean; onToggle: () => void }) {
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || source) return;
    let cancelled = false;
    setLoading(true);

    setError("");

    loadSource()
      .then((nextSource) => {
        if (!cancelled) setSource(nextSource);
      })
      .catch(() => {
        if (!cancelled) setError("예제 코드를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadSource, open, source]);

  const sourceLines = source ? source.split("\n") : [error || "예제 코드를 불러오는 중입니다."];

  return (
    <div className={open ? "code-panel is-open" : "code-panel"} data-testid="code-panel">
      <div className="code-footer">
        <span>복사 가능한 예제 코드</span>
        <Button className="code-toggle" data-stable-control="code-toggle" onClick={onToggle} wide>
          <StableTextSlot wide>{open ? "코드 닫기" : "코드 보기"}</StableTextSlot>
        </Button>
      </div>
      {open ? (
        <div className="code-area">
          <pre aria-busy={loading}>
            <code>
              {sourceLines.map((line, index) => (
                <span className="code-line" key={`${index}-${line}`}>
                  <span className="line-number">{index + 1}</span>
                  <span>{line || " "}</span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}
