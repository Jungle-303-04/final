import { useState } from "react";

const rows = [
  { id: "run-481", owner: "AI", state: "성공" },
  { id: "run-482", owner: "Git", state: "실패" },
  { id: "run-483", owner: "배포", state: "대기" }
];

export default function ComponentTableRowActionsExample() {
  const [selected, setSelected] = useState(rows[1]);

  return (
    <section className="component-demo wide-demo">
      <header>
        <strong>작업 테이블</strong>
        <span>행 선택과 상세 패널을 함께 연결</span>
      </header>
      <div className="component-table-wrap">
        <table>
          <thead><tr><th>실행</th><th>소유</th><th>상태</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr className={selected.id === row.id ? "active" : ""} key={row.id} onClick={() => setSelected(row)}>
                <td>{row.id}</td><td>{row.owner}</td><td>{row.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <aside>
          <strong>{selected.id}</strong>
          <p>{selected.owner} 채널에서 관리하는 {selected.state} 상태 작업입니다.</p>
        </aside>
      </div>
    </section>
  );
}
