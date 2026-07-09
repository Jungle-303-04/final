import { useState } from "react";

const layers = {
  Region: ["us-east", "ap-northeast"],
  Cluster: ["preview-a", "prod-b"],
  Pod: ["web-7b9", "worker-2af"]
};

export default function DrilldownMapLayersExample() {
  const [layer, setLayer] = useState<keyof typeof layers>("Region");

  return (
    <div className="map-layer-card">
      <div className="segmented-row">
        {Object.keys(layers).map((item) => (
          <button className={layer === item ? "active" : ""} key={item} onClick={() => setLayer(item as keyof typeof layers)}>
            {item}
          </button>
        ))}
      </div>
      <div className="map-canvas">
        {layers[layer].map((item, index) => <button style={{ left: `${22 + index * 38}%`, top: `${34 + index * 18}%` }} key={item}>{item}</button>)}
      </div>
      <span>Viewing {layer} layer</span>
    </div>
  );
}
