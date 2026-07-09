const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function HeatmapWeekdayLabelsExample() {
  return (
    <div className="weekday-heatmap">
      {weekdays.map((day, dayIndex) => (
        <div className="weekday-row" key={day}>
          <strong>{day}</strong>
          {Array.from({ length: 5 }, (_, index) => {
            const value = (dayIndex * 23 + index * 17 + 9) % 100;
            return (
              <button className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={index}>
                {value}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
