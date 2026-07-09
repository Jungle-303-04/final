import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { stage: "대기", count: 8 },
  { stage: "가져오기", count: 8 },
  { stage: "테스트", count: 5 },
  { stage: "빌드", count: 5 },
  { stage: "배포", count: 2 },
  { stage: "완료", count: 0 }
];

export default function ChartAreaStepExample() {
  return (
    <section className="chart-card">
      <header>
        <strong>스텝 영역형 차트</strong>
        <span>파이프라인 단계가 넘어갈 때 남은 작업 수</span>
      </header>
      <ResponsiveContainer height={280} width="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="stage" stroke="#a1a1aa" />
          <YAxis stroke="#a1a1aa" />
          <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa" }} />
          <Area dataKey="count" name="남은 작업" stroke="#fdba74" fill="#fdba7430" type="step" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
