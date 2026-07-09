import { useState } from "react";

const points = [
  {
    id: "compact",
    label: "간단히",
    title: "요약 보기",
    rows: ["Git 가져오기 64%", "시각 검사 대기"]
  },
  {
    id: "half",
    label: "절반",
    title: "로그와 작업",
    rows: ["remote 객체 18개 수신", "delta 73% 해석", "충돌 검사 실행 중"]
  },
  {
    id: "full",
    label: "전체",
    title: "상세 작업 목록",
    rows: ["1. 원격 브랜치 동기화", "2. 타입 검사 실행", "3. 시각 회귀 검사", "4. 미리보기 배포 준비"]
  }
] as const;

export default function AnimatedDrawerSnapPointsExample() {
  const [point, setPoint] = useState<(typeof points)[number]["id"]>("half");
  const active = points.find((item) => item.id === point) ?? points[1];

  return (
    <div className={`snap-drawer-stage ${point}`} data-testid="snap-drawer-example">
      <header className="snap-drawer-toolbar">
        <div>
          <strong>하단 드로어 스냅 포인트</strong>
          <span>같은 화면 안에서 정보 밀도를 단계적으로 높입니다.</span>
        </div>
        <div className="segmented-control" aria-label="드로어 높이 선택">
          {points.map((item) => (
            <button
              className={item.id === point ? "active" : ""}
              data-stable-control="drawer-snap"
              data-testid={`drawer-snap-${item.id}`}
              key={item.id}
              onClick={() => setPoint(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <div className="snap-drawer-canvas" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <aside className="snap-drawer-panel" data-testid="snap-drawer-panel">
        <div>
          <strong>{active.title}</strong>
          <span>{active.rows.length}개 항목</span>
        </div>
        <ul>
          {active.rows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
