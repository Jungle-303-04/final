const rows = [
  { name: "설치", start: 0, width: 30 },
  { name: "타입 검사", start: 28, width: 24 },
  { name: "빌드", start: 48, width: 34 },
  { name: "스모크", start: 78, width: 18 }
];

export default function JobWaterfallExample() {
  return (
    <div className="waterfall-card">
      {rows.map((row) => (
        <div className="waterfall-row" key={row.name}>
          <span>{row.name}</span>
          <div>
            <i style={{ left: `${row.start}%`, width: `${row.width}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
