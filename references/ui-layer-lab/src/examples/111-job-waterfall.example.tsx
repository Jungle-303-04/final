const rows = [
  { name: "install", start: 0, width: 30 },
  { name: "typecheck", start: 28, width: 24 },
  { name: "build", start: 48, width: 34 },
  { name: "smoke", start: 78, width: 18 }
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
