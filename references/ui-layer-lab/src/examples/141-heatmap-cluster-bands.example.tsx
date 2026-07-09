const clusters = [
  { name: "frontend", values: [24, 45, 82, 61] },
  { name: "agent", values: [38, 72, 55, 91] },
  { name: "gateway", values: [18, 36, 44, 67] }
];

export default function HeatmapClusterBandsExample() {
  return (
    <div className="cluster-bands">
      {clusters.map((cluster) => (
        <section key={cluster.name}>
          <strong>{cluster.name}</strong>
          <div>
            {cluster.values.map((value, index) => (
              <button className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={index}>
                {value}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
