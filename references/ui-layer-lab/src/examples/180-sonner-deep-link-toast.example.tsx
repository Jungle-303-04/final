import { useState } from "react";
import { toast } from "sonner";

export default function SonnerDeepLinkToastExample() {
  const [route, setRoute] = useState("/실행");

  function openToast() {
    toast("실행이 완료되었습니다", {
      action: {
        label: "열기",
        onClick: () => setRoute("/실행/run-417/로그")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{route}</strong>
      <span>토스트 액션이 현재 경로 미리보기를 갱신합니다.</span>
      <button className="command-trigger stable-wide" onClick={openToast} type="button">토스트 보기</button>
    </div>
  );
}
