const clusters = [
  { name: "프론트엔드", values: [24, 45, 82, 61] },
  { name: "에이전트", values: [38, 72, 55, 91] },
  { name: "게이트웨이", values: [18, 36, 44, 67] }
];

export default function HeatmapClusterBandsExample() {
  return (
    <div className="cluster-bands">
      {clusters.map((cluster) => (
        <section key={cluster.name}>
          <strong>{cluster.name}</strong>
          <div>
            {cluster.values.map((value, index) => (
              <button aria-label={`${cluster.name} ${index + 1}번째 구간 값 ${value}`} className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={index} type="button">
                {value}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
