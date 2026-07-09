import { useState } from "react";

const initial = ["로그 검토", "라우트 수정", "스모크 재실행"];

export default function AnimatedSwipeListExample() {
  const [items, setItems] = useState(initial);

  return (
    <div className="swipe-list">
      {items.map((item) => (
        <div className="swipe-row" key={item}>
          <span>{item}</span>
          <button onClick={() => setItems((current) => current.filter((value) => value !== item))} type="button">
            완료
          </button>
        </div>
      ))}
      {items.length === 0 ? <span className="muted">모든 항목이 정리되었습니다</span> : null}
    </div>
  );
}
