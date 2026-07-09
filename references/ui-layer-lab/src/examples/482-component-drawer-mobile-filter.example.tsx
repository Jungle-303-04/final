import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

const filters = ["실패", "느림", "승인 대기", "아티팩트 있음"];

export default function ComponentDrawerMobileFilterExample() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("실패");
  useEscapeClose(open, () => setOpen(false));

  return (
    <section className="component-demo">
      <header>
        <strong>모바일 필터 드로어</strong>
        <span>작은 화면에서 필터를 하단 레이어로 분리</span>
      </header>
      <button className="component-primary" onClick={() => setOpen(true)} type="button">
        필터 열기
      </button>
      <p className="component-muted">현재 필터: {active}</p>

      {open ? (
        <div className="drawer-sheet">
          <button className="component-backdrop-button" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <div className="drawer-panel">
            <strong>작업 필터</strong>
            {filters.map((filter) => (
              <button className={active === filter ? "selected" : ""} key={filter} onClick={() => setActive(filter)} type="button">
                {filter}
              </button>
            ))}
            <button onClick={() => setOpen(false)} type="button">적용</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
