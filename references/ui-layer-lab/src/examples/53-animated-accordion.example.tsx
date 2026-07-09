import { useState } from "react";

const items = [
  { id: "pull", title: "Git pull", detail: "origin을 가져오고 로컬 커밋을 재정렬한 뒤 상태를 새로고침합니다." },
  { id: "test", title: "검사 실행", detail: "TypeScript와 브라우저 smoke 검사가 실행 중입니다." },
  { id: "push", title: "푸시", detail: "브랜치를 업로드하고 원격 응답을 기다립니다." }
];

export default function AnimatedAccordionExample() {
  const [open, setOpen] = useState(items[0].id);

  return (
    <div className="animated-accordion">
      {items.map((item) => (
        <section className={item.id === open ? "open" : ""} key={item.id}>
          <button onClick={() => setOpen(item.id)} type="button">{item.title}</button>
          {item.id === open ? <p>{item.detail}</p> : null}
        </section>
      ))}
    </div>
  );
}
