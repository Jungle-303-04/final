import { useState } from "react";

const nav = ["대시보드", "작업", "AI", "로그", "설정"];

export default function ComponentSidebarResponsiveNavExample() {
  const [active, setActive] = useState("작업");

  return (
    <section className="component-demo wide-demo">
      <header>
        <strong>서비스 사이드바</strong>
        <span>작업형 서비스에서 반복 탐색을 고정</span>
      </header>
      <div className="sidebar-shell">
        <nav>
          {nav.map((item) => (
            <button className={active === item ? "active" : ""} key={item} onClick={() => setActive(item)}>
              {item}
            </button>
          ))}
        </nav>
        <main>
          <strong>{active}</strong>
          <p>선택한 영역의 핵심 지표와 최근 이벤트를 표시합니다.</p>
        </main>
      </div>
    </section>
  );
}
