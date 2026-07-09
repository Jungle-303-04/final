import { useState } from "react";

const clusters = {
  설치: ["L10 npm ci", "L12 캐시 적중"],
  빌드: ["L33 vite build", "L41 청크 경고"],
  검사: ["L62 chromium", "L78 스크린샷 차이"]
};

export default function DrilldownRelatedLogClusterExample() {
  const [cluster, setCluster] = useState<keyof typeof clusters>("빌드");

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {Object.keys(clusters).map((item) => <button className="row-button" key={item} onClick={() => setCluster(item as keyof typeof clusters)} type="button">{item}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{cluster}</strong>
        {clusters[cluster].map((line) => <span key={line}>{line}</span>)}
      </aside>
    </div>
  );
}
