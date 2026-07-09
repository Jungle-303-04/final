import { useState } from "react";

const buckets = {
  "1h": [12, 22, 48, 66, 81, 93],
  "6h": [18, 31, 44, 58, 72, 89]
};

export default function HeatmapBucketSizeSwitcherExample() {
  const [bucket, setBucket] = useState<keyof typeof buckets>("1h");

  return (
    <div className="threshold-heatmap">
      <button className="command-trigger" onClick={() => setBucket(bucket === "1h" ? "6h" : "1h")}>{bucket}</button>
      <div className="small-heatmap-grid">
        {buckets[bucket].map((value) => <button className={`heat-cell ${value > 75 ? "hot" : value > 40 ? "warm" : "cool"}`} key={value}>{value}</button>)}
      </div>
    </div>
  );
}
