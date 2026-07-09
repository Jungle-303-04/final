import { useState } from "react";

export default function ComponentEmptyRecoveryStateExample() {
  const [loaded, setLoaded] = useState(false);

  return (
    <section className="component-demo">
      <header>
        <strong>빈 상태 복구</strong>
        <span>결과가 없을 때 다음 액션을 바로 제안</span>
      </header>
      {loaded ? (
        <div className="component-result-card">
          <strong>주변 로그를 불러왔습니다.</strong>
          <p>같은 시간대의 warning 로그 6개가 발견되었습니다.</p>
        </div>
      ) : (
        <div className="component-empty">
          <strong>선택한 조건의 로그가 없습니다.</strong>
          <p>시간 범위를 넓히거나 관련 step 로그를 함께 볼 수 있습니다.</p>
          <button onClick={() => setLoaded(true)}>주변 로그 불러오기</button>
        </div>
      )}
    </section>
  );
}
