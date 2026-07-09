import { useState } from "react";
import { useEscapeClose } from "./shared/useEscapeClose";

const actions = ["상세 보기", "로그 복사", "재실행", "격리 처리"];

export default function ComponentDropdownRowActionsExample() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("아직 선택한 액션이 없습니다.");
  useEscapeClose(open, () => setOpen(false));

  return (
    <section className="component-demo">
      <header>
        <strong>행 액션 드롭다운</strong>
        <span>테이블 row에서 자주 쓰는 후속 액션 묶기</span>
      </header>
      <div className="component-row-card">
        <div>
          <strong>deploy-prod-482</strong>
          <span>테스트 실패 2건</span>
        </div>
        <div className="dropdown-wrap">
          <button onClick={() => setOpen((value) => !value)} type="button">액션</button>
          {open ? (
            <div className="dropdown-menu">
              {actions.map((action) => (
                <button
                  key={action}
                  onClick={() => {
                    setSelected(`${action} 선택됨`);
                    setOpen(false);
                  }}
                  type="button"
                >
                  {action}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <p className="component-muted">{selected}</p>
    </section>
  );
}
