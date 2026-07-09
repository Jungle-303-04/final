import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

const contexts = ["현재 페이지", "선택한 로그", "최근 diff", "실패한 step"];

export default function ComponentPopoverContextPickerExample() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState("현재 페이지");
  useEscapeClose(open, () => setOpen(false));

  return (
    <section className="component-demo">
      <header>
        <strong>AI 컨텍스트 팝오버</strong>
        <span>작은 선택지를 현재 버튼 근처에서 바로 고르기</span>
      </header>
      <div className="popover-wrap">
        <button className="component-primary" onClick={() => setOpen((value) => !value)} type="button">
          {context}
        </button>
        {open ? (
          <div className="popover-panel">
            {contexts.map((item) => (
              <button
                className={context === item ? "selected" : ""}
                key={item}
                onClick={() => {
                  setContext(item);
                  setOpen(false);
                }}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
