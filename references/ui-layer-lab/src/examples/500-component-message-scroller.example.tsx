import { useState } from "react";

const messages = [
  "AI가 실패 로그를 읽는 중입니다.",
  "관련 커밋 3개를 찾았습니다.",
  "테스트 재실행 명령을 제안합니다."
];

export default function ComponentMessageScrollerExample() {
  const [count, setCount] = useState(2);
  const visible = messages.slice(0, count);

  return (
    <section className="component-demo">
      <header>
        <strong>메시지 스크롤러</strong>
        <span>대화형 응답을 작은 피드로 누적</span>
      </header>
      <div className="message-scroller">
        {visible.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
      <button className="component-primary" onClick={() => setCount((value) => Math.min(messages.length, value + 1))}>
        다음 메시지
      </button>
    </section>
  );
}
