import { useState } from "react";

const artifacts = {
  summary: "배포가 /preview 404 응답 이후 실패했습니다.",
  patch: "- 오래된 라우트 제거\n+ 프리뷰 라우트 복원",
  checklist: "1. 라우트 복원\n2. 스모크 재실행\n3. 브랜치 푸시"
};

const artifactLabels: Record<keyof typeof artifacts, string> = {
  summary: "요약",
  patch: "패치",
  checklist: "체크리스트"
};

export default function AiArtifactPreviewExample() {
  const [artifact, setArtifact] = useState<keyof typeof artifacts>("summary");

  return (
    <div className="artifact-layout">
      <div className="ai-chat-card">
        <div className="chat-message assistant">실패한 실행에서 아티팩트 3개를 만들었습니다.</div>
        <div className="segmented-row">
          {Object.keys(artifacts).map((key) => (
            <button className={artifact === key ? "active" : ""} key={key} onClick={() => setArtifact(key as keyof typeof artifacts)} type="button">
              {artifactLabels[key as keyof typeof artifacts]}
            </button>
          ))}
        </div>
      </div>
      <pre className="artifact-preview">{artifacts[artifact]}</pre>
    </div>
  );
}
