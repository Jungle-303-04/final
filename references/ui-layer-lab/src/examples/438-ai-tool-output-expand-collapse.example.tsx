import { useState } from "react";

export default function AiToolOutputExpandCollapseExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="height-reveal-card">
      <button className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">{open ? "결과 접기" : "결과 펼치기"}</button>
      <div className={open ? "height-reveal open" : "height-reveal"}>
        <span>npm run test</span>
        <span>2개 실패, 18개 통과</span>
        <span>다음 단계로 생성된 패치를 확인합니다.</span>
      </div>
    </div>
  );
}
