import { toast } from "sonner";

export default function SonnerMaintenanceWindowExample() {
  return (
    <button
      className="command-trigger stable-wide"
      onClick={() => toast.info("유지보수는 02:00에 시작됩니다", { description: "배포 작업은 15분 동안 일시 정지됩니다." })}
      type="button"
    >
      유지보수 공지
    </button>
  );
}
