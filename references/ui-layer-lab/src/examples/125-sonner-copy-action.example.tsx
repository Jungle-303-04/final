import { toast } from "sonner";

export default function SonnerCopyActionExample() {
  function copy() {
    toast.success("명령을 복사했습니다", {
      description: "npm run build",
      action: {
        label: "다시 복사",
        onClick: () => toast("클립보드에 복사했습니다")
      }
    });
  }

  return (
    <button className="command-trigger stable-wide" onClick={copy} type="button">
      빌드 명령 복사
    </button>
  );
}
