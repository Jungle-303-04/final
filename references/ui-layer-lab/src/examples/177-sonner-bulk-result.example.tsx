import { toast } from "sonner";

const files = ["App.tsx", "registry.ts", "styles.css"];

export default function SonnerBulkResultExample() {
  function run() {
    toast.custom(() => (
      <div className="custom-toast">
        <strong>파일 3개 포맷 완료</strong>
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    ));
  }

  return (
    <button className="command-trigger stable-wide" onClick={run} type="button">
      일괄 결과 보기
    </button>
  );
}
