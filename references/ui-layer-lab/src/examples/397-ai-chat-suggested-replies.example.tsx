import { useState } from "react";

const replies = ["Explain failure", "Open logs", "Create fix plan"];

export default function AiChatSuggestedRepliesExample() {
  const [reply, setReply] = useState("No reply selected");

  return (
    <div className="ai-chat-card">
      <strong>Assistant</strong>
      <span>The build failed in visual smoke. Pick a next step.</span>
      <div className="tool-call-actions">
        {replies.map((item) => <button key={item} onClick={() => setReply(item)}>{item}</button>)}
      </div>
      <strong>{reply}</strong>
    </div>
  );
}
