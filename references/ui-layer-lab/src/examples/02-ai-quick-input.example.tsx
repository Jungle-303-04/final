import { FormEvent, useState } from "react";
export default function AiQuickInputExample() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("현재 화면에 대해 질문해 보세요.");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAnswer(`AI 답변: "${question}"에 대한 원인과 다음 액션을 요약했습니다.`);
    setQuestion("");
    setOpen(false);
  }

  return (
    <div className="example-stack">
      <button className="primary-button" onClick={() => setOpen(true)}>
        AI에게 묻기
      </button>
      <div className="answer-box">{answer}</div>

      {open ? (
        <div className="overlay" role="dialog" aria-modal="true">
          <button className="backdrop" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <form className="quick-input" onSubmit={submit}>
            <input
              autoFocus
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="현재 화면에 대해 질문하세요"
            />
            <button type="submit">전송</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
