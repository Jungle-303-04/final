import { toast } from "sonner";

export default function SonnerTypesExample() {
  return (
    <div className="button-grid">
      <button onClick={() => toast("기본 알림입니다")} type="button">기본</button>
      <button onClick={() => toast.success("저장되었습니다")} type="button">성공</button>
      <button onClick={() => toast.info("새 배포가 시작되었습니다")} type="button">정보</button>
      <button onClick={() => toast.warning("승인이 필요합니다")} type="button">경고</button>
      <button onClick={() => toast.error("배포에 실패했습니다")} type="button">오류</button>
      <button
        onClick={() =>
          toast.promise(new Promise((resolve) => window.setTimeout(resolve, 1400)), {
            loading: "저장소 동기화 중...",
            success: "저장소 동기화 완료",
            error: "동기화 실패"
          })
        }
        type="button"
      >
        비동기
      </button>
    </div>
  );
}
