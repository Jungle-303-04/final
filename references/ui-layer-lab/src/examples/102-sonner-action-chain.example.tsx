import { toast } from "sonner";

export default function SonnerActionChainExample() {
  function first() {
    toast("브랜치를 푸시했습니다", {
      action: {
        label: "PR 열기",
        onClick: () => toast.success("Pull request를 열었습니다")
      }
    });
  }

  return (
    <button className="command-trigger" onClick={first} type="button">
      브랜치 푸시
    </button>
  );
}
