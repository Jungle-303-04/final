import { useState } from "react";

export default function AnimatedResizableSplitViewExample() {
  const [wide, setWide] = useState(false);

  return (
    <div className={wide ? "split-resize wide" : "split-resize"}>
      <section aria-label="편집 영역">편집기</section>
      <section aria-label="미리보기 영역">미리보기</section>
      <button aria-pressed={wide} className="command-trigger stable-wide" onClick={() => setWide((value) => !value)} type="button">
        크기 조절
      </button>
    </div>
  );
}
