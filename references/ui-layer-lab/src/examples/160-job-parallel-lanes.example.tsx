const lanes = [
  { name: "프론트엔드", jobs: ["설치", "빌드", "검사"] },
  { name: "백엔드", jobs: ["린트", "테스트", "패키징"] },
  { name: "에이전트", jobs: ["동기화", "검증"] }
];

export default function JobParallelLanesExample() {
  return (
    <div className="parallel-lanes">
      {lanes.map((lane) => (
        <section key={lane.name}>
          <strong>{lane.name}</strong>
          {lane.jobs.map((job) => (
            <span key={job}>{job}</span>
          ))}
        </section>
      ))}
    </div>
  );
}
