import { useState } from "react";

const stages = [
  { id: "fetch", title: "소스 가져오기", detail: "origin/main 기준으로 12개 커밋을 비교했습니다." },
  { id: "test", title: "테스트 실행", detail: "단위 테스트 128개 중 126개가 통과했습니다." },
  { id: "deploy", title: "배포 준비", detail: "아티팩트 서명과 환경 변수 검사가 남았습니다." }
];

export default function ComponentAccordionLogStagesExample() {
  const [open, setOpen] = useState("test");

  return (
    <section className="component-demo">
      <header>
        <strong>작업 단계 아코디언</strong>
        <span>로그 상세를 한 단계씩 펼쳐 확인</span>
      </header>
      <div className="component-stack">
        {stages.map((stage) => (
          <article className="accordion-item" key={stage.id}>
            <button onClick={() => setOpen(open === stage.id ? "" : stage.id)}>
              <span>{stage.title}</span>
              <strong>{open === stage.id ? "접기" : "열기"}</strong>
            </button>
            {open === stage.id ? <p>{stage.detail}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
