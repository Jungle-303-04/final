const weekdays = ["월", "화", "수", "목", "금"];

export default function HeatmapWeekdayLabelsExample() {
  return (
    <div className="weekday-heatmap">
      {weekdays.map((day, dayIndex) => (
        <div className="weekday-row" key={day}>
          <strong>{day}</strong>
          {Array.from({ length: 5 }, (_, index) => {
            const value = (dayIndex * 23 + index * 17 + 9) % 100;
            return (
              <button aria-label={`${day}요일 ${index + 1}번째 값 ${value}`} className={`heat-cell ${value > 70 ? "hot" : value > 40 ? "warm" : "cool"}`} key={index} type="button">
                {value}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
