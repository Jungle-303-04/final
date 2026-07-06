// 메트릭 트리 불변식 검증 (기획서 I3·I6·I11) — `npx tsx scripts/validate-metrics.ts`
import { CLUSTERS } from '../src/features/console/mock';
import { collectorOf, getClusterAgg, getFleetAgg, validateInvariants } from '../src/features/console/metrics';

let failed = 0;

for (const c of CLUSTERS) {
  const errors = validateInvariants(c.id);
  const collector = collectorOf(c.id);
  const tag = collector.healthy ? 'OK ' : 'N/A';
  if (errors.length > 0) {
    failed += 1;
    console.log(`✗ ${c.id}`);
    for (const e of errors) console.log(`   - ${e}`);
  } else {
    const a = getClusterAgg(c.id);
    console.log(
      `✓ [${tag}] ${c.id.padEnd(22)} CPU ${a.cpuUsePct.toFixed(1).padStart(5)}%  MEM ${a.memUsePct
        .toFixed(1)
        .padStart(5)}%  $${a.costMonth.toFixed(0).padStart(6)}/월  ${collector.healthy ? '' : `(${collector.reason})`}`,
    );
  }
}

// 플릿 = Σ(가용 클러스터) 검증
const fleet = getFleetAgg(CLUSTERS.map((c) => c.id));
const okAggs = CLUSTERS.map((c) => getClusterAgg(c.id)).filter((a) => a.available);
const sumCost = okAggs.reduce((s, a) => s + a.costMonth, 0);
if (Math.abs(fleet.costMonth - sumCost) > 0.01) {
  failed += 1;
  console.log(`✗ 플릿 비용(${fleet.costMonth}) ≠ Σ클러스터(${sumCost})`);
}
console.log(
  `\n플릿: ${fleet.availableCount}/${fleet.clusterCount} 가용, 팟 ${fleet.podCount.toLocaleString()}개, CPU ${fleet.cpuUsePct.toFixed(1)}%, MEM ${fleet.memUsePct.toFixed(1)}%, $${fleet.costMonth.toFixed(0)}/월`,
);
console.log(`데이터 없음: ${fleet.noData.join(', ') || '없음'}`);

if (failed > 0) {
  console.error(`\n불변식 위반 ${failed}건`);
  process.exit(1);
}
console.log('\n모든 불변식 통과 ✓');
