import { useState } from "react";

export default function ComponentPaginationLogPagesExample() {
  const [page, setPage] = useState(2);

  return (
    <section className="component-demo">
      <header>
        <strong>로그 페이지네이션</strong>
        <span>긴 로그를 일정한 덩어리로 이동</span>
      </header>
      <div className="component-result-card">
        <strong>페이지 {page}</strong>
        <p>라인 {(page - 1) * 100 + 1}부터 {page * 100}까지 표시합니다.</p>
      </div>
      <div className="pagination-row">
        {[1, 2, 3, 4, 5].map((item) => (
          <button className={page === item ? "active" : ""} key={item} onClick={() => setPage(item)}>{item}</button>
        ))}
      </div>
    </section>
  );
}
