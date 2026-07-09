import { useEffect, useState } from "react";

const answer = "The visual smoke step failed because the route was removed from the product router.";

export default function AiStreamingMessageExample() {
  const [text, setText] = useState("");

  useEffect(() => {
    setText("");
    let index = 0;

    const timer = window.setInterval(() => {
      index += 1;
      setText(answer.slice(0, index));

      if (index >= answer.length) {
        window.clearInterval(timer);
      }
    }, 28);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="ai-chat-card">
      <div className="chat-message user">Why did this run fail?</div>
      <div className="chat-message assistant">
        {text}
        <span className="cursor" />
      </div>
    </div>
  );
}
