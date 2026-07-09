import { useState } from "react";
const messages = [
  { role: "user", text: "최근 실행이 왜 실패했나요?" },
  { role: "assistant", text: "시각 스모크 단계가 더 이상 마운트되지 않은 라우트를 기다렸습니다." }
];

export default function AssistantDrawerExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="split-demo">
      <div className="fake-page">
        <strong>배포 미리보기</strong>
        <p>시각 스모크에서 품질 검사가 실패했습니다.</p>
        <button className="primary-button stable-wide" onClick={() => setOpen(true)} type="button">
          AI 열기
        </button>
      </div>

      {open ? (
        <aside className="drawer">
          <div className="drawer-header">
            <strong>AI 어시스턴트</strong>
            <button onClick={() => setOpen(false)} type="button">닫기</button>
          </div>
          {messages.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.text}>
              {message.text}
            </article>
          ))}
          <div className="context-card">
            컨텍스트: 배포 미리보기 / 시각 스모크 / 실패
          </div>
        </aside>
      ) : null}
    </div>
  );
}
