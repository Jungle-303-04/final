import { useState } from "react";
import { toast } from "sonner";

export default function SonnerUndoStackExample() {
  const [archived, setArchived] = useState<string[]>([]);

  function archive(item: string) {
    setArchived((items) => [...items, item]);
    toast(`${item} 보관됨`, {
      action: {
        label: "되돌리기",
        onClick: () => setArchived((items) => items.filter((entry) => entry !== item))
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>보관된 실행 {archived.length}개</strong>
      <button className="command-trigger stable-wide" onClick={() => archive(`run-${archived.length + 1}`)} type="button">실행 보관</button>
    </div>
  );
}
