// 홈 대시보드 — 플릿 집계(/fleet/summary) + 인시던트 타임라인 + 승인 대기 + 최근 AI 대화 (전부 실데이터)
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Chip, PageHeader, Table, type ChipSeverity } from '@/plural-ui';
import { CaretRightIcon, GlobeIcon, SendIcon, ShieldIcon } from '@/plural-ui/icons';
import { healthLabel, healthScore, useFleetSummary, type FleetHealth } from '@/features/fleet/api';
import { timeAgo, useNotices, useTimeline } from '@/features/notifications/api';
import { useConversations } from '@/features/chat/api';
import { RegisterClusterWizard } from '@/features/resources/RegisterClusterWizard';
import { ConnectRepoWizard } from '@/features/resources/ConnectRepoWizard';
import { TreemapChart, type HeatNode } from '@/shared/ui/charts';
import { EmptyState, QueryBoundary, Skeleton } from '@/shared/ui';
import { StatCard } from '../ui';

const HEALTH_SEVERITY: Record<FleetHealth, ChipSeverity> = { healthy: 'success', warning: 'warning', critical: 'danger' };
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);

export function HomePage() {
  const navigate = useNavigate();
  const fleetQ = useFleetSummary();
  const timelineQ = useTimeline();
  const { notices } = useNotices();
  const conversationsQ = useConversations();
  const [clusterWizard, setClusterWizard] = useState(false);
  const [repoWizard, setRepoWizard] = useState(false);

  const approvals = notices.filter(n => n.kind === 'approval').slice(0, 5);

  return (
    <>
      <PageHeader
        title="플릿 현황"
        sub="클러스터 · GitOps 배포 · 인시던트(RCA)를 한 화면에서"
        actions={
          <>
            <Button onClick={() => setRepoWizard(true)}>+ 레포 연결</Button>
            <Button variant="primary" onClick={() => setClusterWizard(true)}>+ 클러스터 등록</Button>
          </>
        }
      />

      {/* ── 집계 카드 + 히트맵 + 클러스터 테이블 — GET /fleet/summary ── */}
      <QueryBoundary query={fleetQ} skeletonLines={5}>{fleet => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard
              label="클러스터"
              value={fleet.totals.clusters}
              chip={fleet.totals.critical > 0 ? `위험 ${fleet.totals.critical}` : fleet.totals.warning > 0 ? `주의 ${fleet.totals.warning}` : fleet.totals.clusters > 0 ? '모두 정상' : undefined}
              chipSeverity={fleet.totals.critical > 0 ? 'danger' : fleet.totals.warning > 0 ? 'warning' : 'success'}
            />
            <StatCard label="열린 인시던트" value={fleet.totals.open_incidents} chip={fleet.totals.open_incidents > 0 ? '조치 필요' : undefined} chipSeverity="danger" />
            <StatCard label="승인 대기" value={fleet.totals.pending_approvals} chip={fleet.totals.pending_approvals > 0 ? '검토 필요' : undefined} chipSeverity="warning" />
            <StatCard label="실행 중 워크플로우" value={fleet.totals.running_workflows} />
            <StatCard label="처리 실패 이벤트 (DLQ)" value={fleet.totals.dead_letters} chip={fleet.totals.dead_letters > 0 ? '재처리 필요' : undefined} chipSeverity="danger" />
          </div>

          {fleet.clusters.length === 0 ? (
            <div className="pl-card" style={{ marginBottom: 16 }}>
              <EmptyState
                icon={<GlobeIcon size={26} />}
                title="아직 등록된 클러스터가 없습니다"
                description="클러스터를 등록하고 에이전트가 연결되면 플릿 현황이 여기 표시됩니다"
                action={<Button variant="primary" onClick={() => setClusterWizard(true)}>첫 클러스터 등록</Button>}
              />
            </div>
          ) : (
            <>
              {/* 높이는 차트 minHeight(300)가 결정 — 고정 height 와 minHeight 불일치로 넘치던 것 교정 */}
              <div className="pl-card" style={{ padding: 8, marginBottom: 16 }}>
                <TreemapChart
                  nodes={fleet.clusters.map((c): HeatNode => ({
                    id: c.cluster_id,
                    label: `${c.name} · ${c.pods_running}/${c.pods_total} pods`,
                    value: Math.max(1, c.pods_total),
                    score: healthScore(c.health),
                  }))}
                  onTileClick={id => navigate(`/clusters/${id}`)}
                />
              </div>
              <Table headers={['클러스터', '건강', '팟', '노드', 'CPU', 'MEM', '인시던트', '최근 재시작', '마지막 확인', '']}>
                {fleet.clusters.map(c => (
                  <tr key={c.cluster_id} className="clickable" onClick={() => navigate(`/clusters/${c.cluster_id}`)}>
                    <td><b style={{ color: 'var(--color-text)' }}>{c.name}</b></td>
                    <td><Chip severity={HEALTH_SEVERITY[c.health] ?? 'neutral'}>{healthLabel(c.health)}</Chip></td>
                    <td>{c.pods_running}/{c.pods_total}</td>
                    <td>{c.nodes_ready}/{c.nodes_total}</td>
                    <td>{pct(c.cpu_pct)}</td>
                    <td>{pct(c.mem_pct)}</td>
                    <td>{c.open_incidents > 0 ? <Chip severity="danger">{c.open_incidents}</Chip> : '—'}</td>
                    <td>{c.restarts_recent}</td>
                    <td>{c.last_seen ? timeAgo(c.last_seen) : '—'}</td>
                    <td>
                      <div className="pl-rowactions">
                        <span className="pl-caretbtn" aria-hidden><CaretRightIcon size={14} /></span>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </>
      )}</QueryBoundary>

      {/* ── 최근 인시던트 / 승인 대기 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
        <Card className="pl-stack">
          <div className="pl-row pl-row--between">
            <span className="pl-row" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              <ShieldIcon size={14} /> 최근 인시던트
            </span>
            <Button size="small" onClick={() => navigate('/incidents')}>전체 보기</Button>
          </div>
          <QueryBoundary query={timelineQ} skeletonLines={3}>{items =>
            items.length === 0 ? (
              <p className="pl-muted" style={{ margin: 0 }}>열린 인시던트가 없습니다 — 모니터링 알림이 인입되면 여기 표시됩니다.</p>
            ) : (
              <div className="pl-stack" style={{ gap: 8 }}>
                {items.slice(0, 5).map(i => (
                  <Link key={i.incident_id} to={`/incidents/${i.incident_id}`} className="pl-bindrow" style={{ textDecoration: 'none' }}>
                    <div className="pl-row" style={{ minWidth: 0 }}>
                      <Chip severity="danger">{i.stage}</Chip>
                      <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.summary}</span>
                    </div>
                    <span className="pl-muted" style={{ flex: 'none' }}>{timeAgo(i.at)}</span>
                  </Link>
                ))}
              </div>
            )
          }</QueryBoundary>
        </Card>

        <Card className="pl-stack">
          <div className="pl-row pl-row--between">
            <span className="pl-row" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              <SendIcon size={14} /> 승인 대기 배포
            </span>
            <Button size="small" onClick={() => navigate('/workflows')}>워크플로우</Button>
          </div>
          {approvals.length === 0 ? (
            <p className="pl-muted" style={{ margin: 0 }}>승인 대기 중인 배포가 없습니다.</p>
          ) : (
            <div className="pl-stack" style={{ gap: 8 }}>
              {approvals.map(n => (
                <Link key={n.id} to={n.link} className="pl-bindrow" style={{ textDecoration: 'none' }}>
                  <div className="pl-row" style={{ minWidth: 0 }}>
                    <Chip severity="warning">승인</Chip>
                    <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                  </div>
                  <span className="pl-muted" style={{ flex: 'none' }}>{n.at ? timeAgo(n.at) : ''}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── 최근 AI 대화 — GET /ai/conversations ── */}
      <div style={{ marginTop: 16 }}>
        <Card className="pl-stack">
          <div className="pl-row pl-row--between">
            <span className="pl-row" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              <SendIcon size={14} /> 최근 AI 대화
            </span>
            <Button size="small" onClick={() => navigate('/ai')}>전체 보기</Button>
          </div>
          {conversationsQ.isPending ? <Skeleton lines={2} /> : (conversationsQ.data ?? []).length === 0 ? (
            <p className="pl-muted" style={{ margin: 0 }}>대화 이력이 없습니다 — AI 어시스턴트에게 장애 분석·배포 질문을 해보세요.</p>
          ) : (
            <div className="pl-stack" style={{ gap: 8 }}>
              {(conversationsQ.data ?? []).slice(0, 3).map(c => (
                <Link key={c.conversation_id} to={`/ai/${c.conversation_id}`} className="pl-bindrow" style={{ textDecoration: 'none' }}>
                  <div className="pl-row" style={{ minWidth: 0 }}>
                    <div className="pl-avatar" style={{ width: 26, height: 26, fontSize: 10, background: 'var(--color-fill-two)' }}>AI</div>
                    <span style={{ color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  </div>
                  <span className="pl-muted" style={{ flex: 'none' }}>{timeAgo(c.updated_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <RegisterClusterWizard open={clusterWizard} onClose={() => setClusterWizard(false)} />
      <ConnectRepoWizard open={repoWizard} onClose={() => setRepoWizard(false)} />
    </>
  );
}
