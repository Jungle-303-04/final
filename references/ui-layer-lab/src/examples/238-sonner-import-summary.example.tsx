import { toast } from "sonner";

export default function SonnerImportSummaryExample() {
  function show() {
    toast.custom(() => (
      <div className="custom-toast">
        <strong>가져오기 완료</strong>
        <span>42행 가져옴</span>
        <span>3행 건너뜀</span>
      </div>
    ));
  }

  return <button className="command-trigger stable-wide" onClick={show} type="button">가져오기 요약 보기</button>;
}
