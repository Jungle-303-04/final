import { useState } from "react";

export default function AnimatedHeightRevealExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="height-reveal-card">
      <button className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">{open ? "상세 접기" : "상세 펼치기"}</button>
      <section className={open ? "height-reveal open" : "height-reveal"}>
        <strong>확장된 작업 상세</strong>
        <span>현재 페이지를 떠나지 않고 로그, 아티팩트, 재시도 힌트를 보여줍니다.</span>
      </section>
    </div>
  );
}
