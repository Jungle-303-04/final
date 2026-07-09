import { toast } from "sonner";

export default function SonnerActionChainExample() {
  function first() {
    toast("Branch pushed", {
      action: {
        label: "Open PR",
        onClick: () => toast.success("Pull request opened")
      }
    });
  }

  return (
    <button className="command-trigger" onClick={first}>
      Push Branch
    </button>
  );
}
