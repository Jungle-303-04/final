// AI + Flows/Edge/Self-Service/Workbenches/Security/Cost 그룹
import { useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconFrame,
  Input,
  LinkTabList,
  PageHeader,
  Table,
  TabList,
} from '@/plural-ui';
import { PackageIcon, PlusIcon, SendIcon } from '@/plural-ui/icons';
import {
  AGENT_RUNS,
  AI_THREADS,
  CATALOGS,
  COMPLIANCE_REPORTS,
  COST_ROWS,
  EDGE_CLUSTERS,
  EDGE_IMAGES,
  FLOWS,
  INFRA_RESEARCHES,
  OUTSTANDING_PRS,
  POLICIES,
  PR_AUTOMATIONS,
  SENTINELS,
  VULN_REPORTS,
  WORKBENCHES,
} from '../api';
import { statusSeverity } from '../ui';
import { CreateAutomationWizard, CreateWorkbenchWizard } from '../flows';
import {
  AgentRunModal,
  CostModal,
  GenericDetailModal,
  PolicyModal,
  VulnModal,
  type AgentRunLike,
  type CostLike,
  type PolicyLike,
  type VulnLike,
} from '../popups';

/* ═══ AI ═══════════════════════════════ */
export function AiLayout() {
  return (
    <>
      <PageHeader title="LOGO AI" sub="AI 에이전트 실행과 대화를 관리합니다." />
      <LinkTabList
        tabs={[
          { to: '/console/ai/agent-runs', label: '에이전트 실행' },
          { to: '/console/ai/threads', label: '스레드' },
          { to: '/console/ai/sentinels', label: '센티널' },
          { to: '/console/ai/infra-research', label: '인프라 리서치' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function AiAgentRuns() {
  const [selected, setSelected] = useState<AgentRunLike | null>(null);
  return (
    <>
      <Table headers={['프롬프트', '상태', '시작', '']}>
        {AGENT_RUNS.map((r) => (
          <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
            <td style={{ fontWeight: 600 }}>{r.prompt}</td>
            <td>
              <Chip severity={statusSeverity(r.status)}>{r.status}</Chip>
            </td>
            <td>{r.startedAt}</td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" onClick={() => setSelected(r)}>
                  보기
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <AgentRunModal run={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export function AiThreads() {
  const [draft, setDraft] = useState('');
  return (
    <div className="pl-stack">
      {AI_THREADS.map((t) => (
        <Card key={t.id}>
          <div className="pl-row pl-row--between">
            <div style={{ fontWeight: 600 }}>{t.title}</div>
            <span className="pl-muted">{t.updatedAt}</span>
          </div>
          <p className="pl-sub" style={{ margin: '8px 0 0' }}>
            {t.lastMessage}
          </p>
        </Card>
      ))}
      <Card>
        <div className="pl-row">
          <Input value={draft} onChange={setDraft} placeholder="AI에게 물어보세요…" />
          <Button variant="primary" disabled={!draft}>
            <SendIcon size={14} /> 전송
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function AiSentinels() {
  const [selected, setSelected] = useState<(typeof SENTINELS)[number] | null>(null);
  return (
    <>
      <Table headers={['센티널', '스케줄', '마지막 실행', '상태', '발견']}>
        {SENTINELS.map((s) => (
          <tr key={s.id} className="clickable" onClick={() => setSelected(s)}>
            <td style={{ fontWeight: 600 }}>{s.name}</td>
            <td>{s.schedule}</td>
            <td>{s.lastRun}</td>
            <td>
              <Chip severity={statusSeverity(s.status)}>{s.status}</Chip>
            </td>
            <td>{s.findings > 0 ? <Chip severity="warning">{s.findings}건</Chip> : '—'}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title={`센티널 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '스케줄', value: selected.schedule },
            { label: '마지막 실행', value: selected.lastRun },
            { label: '상태', value: <Chip severity={statusSeverity(selected.status)}>{selected.status}</Chip> },
            {
              label: '발견 사항',
              value:
                selected.findings > 0
                  ? `${selected.findings}건 — CrashLoop 1, NotReady 노드, 버전 스큐`
                  : '없음',
            },
          ]}
        />
      )}
    </>
  );
}

export function AiInfraResearch() {
  const [selected, setSelected] = useState<(typeof INFRA_RESEARCHES)[number] | null>(null);
  return (
    <>
      <Table headers={['주제', '상태', '시작', '보고서']}>
        {INFRA_RESEARCHES.map((r) => (
          <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
            <td style={{ fontWeight: 600 }}>{r.topic}</td>
            <td>
              <Chip severity={statusSeverity(r.status)}>{r.status}</Chip>
            </td>
            <td>{r.startedAt}</td>
            <td>{r.pages > 0 ? `${r.pages}페이지` : '—'}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title="인프라 리서치"
          onClose={() => setSelected(null)}
          rows={[
            { label: '주제', value: selected.topic },
            { label: '상태', value: <Chip severity={statusSeverity(selected.status)}>{selected.status}</Chip> },
            { label: '시작', value: selected.startedAt },
            { label: '보고서', value: selected.pages > 0 ? `${selected.pages}페이지` : '생성 중' },
            { label: '요약', value: selected.pages > 0 ? 'NATS 파티셔닝으로 처리량 2.1배 개선 가능' : '—' },
          ]}
        />
      )}
    </>
  );
}

/* ═══ Flows ════════════════════════════ */
export function FlowsList() {
  const [selected, setSelected] = useState<(typeof FLOWS)[number] | null>(null);
  return (
    <>
      <PageHeader title="플로우" sub="서비스·파이프라인·프리뷰를 하나의 흐름으로 묶어 관리합니다." />
      <Table headers={['플로우', '서비스', '프리뷰', '알림', '업데이트']}>
        {FLOWS.map((f) => (
          <tr key={f.id} className="clickable" onClick={() => setSelected(f)}>
            <td style={{ fontWeight: 600 }}>{f.name}</td>
            <td>{f.services}</td>
            <td>{f.previews}</td>
            <td>{f.alerts > 0 ? <Chip severity="danger">{f.alerts}</Chip> : '—'}</td>
            <td>{f.updatedAt}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title={`플로우 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '서비스', value: `${selected.services}개` },
            { label: '프리뷰 환경', value: `${selected.previews}개` },
            { label: '활성 알림', value: selected.alerts > 0 ? <Chip severity="danger">{selected.alerts}건</Chip> : '없음' },
            { label: '업데이트', value: selected.updatedAt },
            { label: '구성', value: 'api-gateway → rca-worker → alert-worker' },
          ]}
        />
      )}
    </>
  );
}

/* ═══ Edge ═════════════════════════════ */
export function EdgeLayout() {
  return (
    <>
      <PageHeader title="엣지" sub="엣지 디바이스 클러스터를 관리합니다." />
      <LinkTabList
        tabs={[
          { to: '/console/edge/clusters', label: '클러스터' },
          { to: '/console/edge/images', label: '이미지' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function EdgeClusters() {
  const [selected, setSelected] = useState<(typeof EDGE_CLUSTERS)[number] | null>(null);
  return (
    <>
      <Table headers={['클러스터', '상태', '위치', '마지막 핑']}>
        {EDGE_CLUSTERS.map((e) => (
          <tr key={e.id} className="clickable" onClick={() => setSelected(e)}>
            <td style={{ fontWeight: 600 }}>{e.name}</td>
            <td>
              <Chip severity={statusSeverity(e.status)}>{e.status}</Chip>
            </td>
            <td>{e.location}</td>
            <td>{e.pingedAt}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title={`엣지 클러스터 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '상태', value: <Chip severity={statusSeverity(selected.status)}>{selected.status}</Chip> },
            { label: '위치', value: selected.location },
            { label: '마지막 핑', value: selected.pingedAt },
            { label: '디바이스', value: 'Raspberry Pi 5 (arm64)' },
            { label: '이미지', value: <span className="pl-code">edge-base-arm64 v0.4.2</span> },
          ]}
        />
      )}
    </>
  );
}

export function EdgeImages() {
  const [selected, setSelected] = useState<(typeof EDGE_IMAGES)[number] | null>(null);
  return (
    <>
      <Table headers={['이미지', '버전', '크기', '빌드']}>
        {EDGE_IMAGES.map((i) => (
          <tr key={i.id} className="clickable" onClick={() => setSelected(i)}>
            <td style={{ fontWeight: 600 }}>{i.name}</td>
            <td>
              <span className="pl-code">{i.version}</span>
            </td>
            <td>{i.size}</td>
            <td>{i.builtAt}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title={`엣지 이미지 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '버전', value: <span className="pl-code">{selected.version}</span> },
            { label: '크기', value: selected.size },
            { label: '빌드', value: selected.builtAt },
            { label: '아키텍처', value: 'arm64' },
            { label: '포함', value: 'k3s v1.30, cluster-agent, alloy' },
          ]}
        />
      )}
    </>
  );
}

/* ═══ Self-Service ═════════════════════ */
export function SelfServiceLayout() {
  return (
    <>
      <PageHeader title="셀프 서비스" sub="카탈로그와 PR 자동화로 개발자 셀프서비스를 제공합니다." />
      <LinkTabList
        tabs={[
          { to: '/console/self-service/catalogs', label: '카탈로그' },
          { to: '/console/self-service/pr/outstanding', label: '대기 PR' },
          { to: '/console/self-service/pr/automations', label: 'PR 자동화' },
          { to: '/console/self-service/pr/scm', label: 'SCM 연결' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function Catalogs() {
  const [selected, setSelected] = useState<(typeof CATALOGS)[number] | null>(null);
  return (
    <>
      <div className="pl-grid-cards">
        {CATALOGS.map((c) => (
          <div key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
            <Card>
              <div className="pl-row">
                <IconFrame size="md">
                  <PackageIcon />
                </IconFrame>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
              </div>
              <p className="pl-sub" style={{ margin: '10px 0' }}>
                {c.description}
              </p>
              <Chip>{c.apps}개 항목</Chip>
            </Card>
          </div>
        ))}
      </div>
      {selected && (
        <GenericDetailModal
          title={`카탈로그 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '설명', value: selected.description },
            { label: '항목', value: `${selected.apps}개` },
            { label: '권한', value: 'developers 그룹 셀프서비스 허용' },
            { label: '예시 항목', value: 'postgres, redis, kafka, airflow' },
          ]}
        >
          <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
            <Button size="small" variant="primary">
              항목 배포하기
            </Button>
          </div>
        </GenericDetailModal>
      )}
    </>
  );
}

export function OutstandingPrs() {
  const [selected, setSelected] = useState<(typeof OUTSTANDING_PRS)[number] | null>(null);
  return (
    <>
      <Table headers={['PR', '저장소', '상태', '생성']}>
        {OUTSTANDING_PRS.map((p) => (
          <tr key={p.id} className="clickable" onClick={() => setSelected(p)}>
            <td style={{ fontWeight: 600 }}>{p.title}</td>
            <td>
              <span className="pl-code">{p.repo}</span>
            </td>
            <td>
              <Chip severity={statusSeverity(p.status)}>{p.status}</Chip>
            </td>
            <td>{p.createdAt}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title="대기 중인 PR"
          onClose={() => setSelected(null)}
          rows={[
            { label: '제목', value: selected.title },
            { label: '저장소', value: <span className="pl-code">{selected.repo}</span> },
            { label: '상태', value: <Chip severity={statusSeverity(selected.status)}>{selected.status}</Chip> },
            { label: '생성', value: selected.createdAt },
            { label: '작성자', value: selected.id === 'opr-1' ? 'LOGO AI (에이전트 실행 ar-1)' : 'PR 자동화 (cluster-upgrade)' },
          ]}
        >
          <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
            <Button size="small">GitHub에서 열기</Button>
            <Button size="small" variant="primary">
              승인 및 머지
            </Button>
          </div>
        </GenericDetailModal>
      )}
    </>
  );
}

export function PrAutomations() {
  const [selectedPra, setSelectedPra] = useState<(typeof PR_AUTOMATIONS)[number] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <div className="pl-toolbar">
        <span />
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <PlusIcon size={14} /> 자동화 생성
        </Button>
      </div>
      <CreateAutomationWizard open={createOpen} onClose={() => setCreateOpen(false)} />
      <Table headers={['이름', '저장소', '역할', '생성']}>
        {PR_AUTOMATIONS.map((p) => (
          <tr key={p.id} className="clickable" onClick={() => setSelectedPra(p)}>
            <td style={{ fontWeight: 600 }}>{p.name}</td>
            <td>
              <span className="pl-code">{p.repo}</span>
            </td>
            <td>
              <Chip>{p.role}</Chip>
            </td>
            <td>{p.createdAt}</td>
          </tr>
        ))}
      </Table>
      {selectedPra && (
        <GenericDetailModal
          title={`PR 자동화 — ${selectedPra.name}`}
          onClose={() => setSelectedPra(null)}
          rows={[
            { label: '저장소', value: <span className="pl-code">{selectedPra.repo}</span> },
            { label: '역할', value: <Chip>{selectedPra.role}</Chip> },
            { label: '생성', value: selectedPra.createdAt },
            { label: '입력 값', value: 'name, namespace, memory_limit' },
            { label: '템플릿', value: <span className="pl-code">templates/resource-bump</span> },
          ]}
        />
      )}
    </>
  );
}

export function ScmManagement() {
  return (
    <Card>
      <div className="pl-row pl-row--between">
        <div>
          <div style={{ fontWeight: 600 }}>GitHub 연결</div>
          <p className="pl-muted" style={{ marginTop: 4 }}>
            Jungle-303-04 조직에 연결됨
          </p>
        </div>
        <Chip severity="success">연결됨</Chip>
      </div>
    </Card>
  );
}

/* ═══ Workbenches ══════════════════════ */
export function WorkbenchesList() {
  const [selectedWb, setSelectedWb] = useState<(typeof WORKBENCHES)[number] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="워크벤치"
        sub="AI 운영 작업 공간입니다."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 워크벤치 생성
          </Button>
        }
      />
      <CreateWorkbenchWizard open={createOpen} onClose={() => setCreateOpen(false)} />
      <Table headers={['워크벤치', '도구', '작업', '업데이트']}>
        {WORKBENCHES.map((w) => (
          <tr key={w.id} className="clickable" onClick={() => setSelectedWb(w)}>
            <td style={{ fontWeight: 600 }}>{w.name}</td>
            <td>{w.tools}개</td>
            <td>{w.jobs}개</td>
            <td>{w.updatedAt}</td>
          </tr>
        ))}
      </Table>
      {selectedWb && (
        <GenericDetailModal
          title={`워크벤치 — ${selectedWb.name}`}
          onClose={() => setSelectedWb(null)}
          rows={[
            { label: '도구', value: `${selectedWb.tools}개 (kubectl, promql, github, slack, runbook)` },
            { label: '작업', value: `${selectedWb.jobs}개` },
            { label: '업데이트', value: selectedWb.updatedAt },
            { label: '최근 작업', value: 'dashboard-worker RCA (완료)' },
          ]}
        />
      )}
    </>
  );
}

/* ═══ Security ═════════════════════════ */
export function SecurityLayout() {
  return (
    <>
      <PageHeader title="보안" sub="정책, 컴플라이언스, 취약점을 관리합니다." />
      <LinkTabList
        tabs={[
          { to: '/console/security/overview', label: '개요' },
          { to: '/console/security/policies', label: '정책' },
          { to: '/console/security/vulnerability-reports', label: '취약점 보고서' },
          { to: '/console/security/compliance-reports', label: '컴플라이언스' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function SecurityOverview() {
  return (
    <div className="pl-grid-cards">
      <Card>
        <div className="pl-muted">정책 위반</div>
        <div className="co-stat">5건</div>
      </Card>
      <Card>
        <div className="pl-muted">심각 취약점</div>
        <div className="co-stat" style={{ color: 'var(--color-text-danger)' }}>
          1건
        </div>
      </Card>
      <Card>
        <div className="pl-muted">스캔된 이미지</div>
        <div className="co-stat">14개</div>
      </Card>
    </div>
  );
}

export function SecurityPolicies() {
  const [selected, setSelected] = useState<PolicyLike | null>(null);
  return (
    <>
      <Table headers={['정책', '설명', '심각도', '위반']}>
        {POLICIES.map((p) => (
          <tr key={p.id} className="clickable" onClick={() => setSelected(p)}>
            <td>
              <span className="pl-code">{p.name}</span>
            </td>
            <td>{p.description}</td>
            <td>
              <Chip severity={p.severity === '높음' ? 'danger' : 'warning'}>{p.severity}</Chip>
            </td>
            <td>{p.violations}건</td>
          </tr>
        ))}
      </Table>
      <PolicyModal policy={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export function VulnerabilityReports() {
  const [selected, setSelected] = useState<VulnLike | null>(null);
  return (
    <>
      <Table headers={['아티팩트', 'Critical', 'High', 'Medium', 'Low']}>
        {VULN_REPORTS.map((v) => (
          <tr key={v.id} className="clickable" onClick={() => setSelected(v)}>
            <td>
              <span className="pl-code">{v.artifact}</span>
            </td>
            <td>{v.critical > 0 ? <Chip severity="danger">{v.critical}</Chip> : '0'}</td>
            <td>{v.high > 0 ? <Chip severity="warning">{v.high}</Chip> : '0'}</td>
            <td>{v.medium}</td>
            <td>{v.low}</td>
          </tr>
        ))}
      </Table>
      <VulnModal report={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export function ComplianceReports() {
  const [selected, setSelected] = useState<(typeof COMPLIANCE_REPORTS)[number] | null>(null);
  return (
    <>
    <Table headers={['보고서', '클러스터', '통과', '실패', '생성']}>
      {COMPLIANCE_REPORTS.map((c) => (
        <tr key={c.id} className="clickable" onClick={() => setSelected(c)}>
          <td style={{ fontWeight: 600 }}>{c.name}</td>
          <td>{c.cluster}</td>
          <td>
            <Chip severity="success">{c.passed}</Chip>
          </td>
          <td>{c.failed > 10 ? <Chip severity="danger">{c.failed}</Chip> : <Chip severity="warning">{c.failed}</Chip>}</td>
          <td>{c.generatedAt}</td>
        </tr>
      ))}
    </Table>
    {selected && (
      <GenericDetailModal
        title={`컴플라이언스 — ${selected.cluster}`}
        onClose={() => setSelected(null)}
        rows={[
          { label: '벤치마크', value: selected.name },
          { label: '통과', value: <Chip severity="success">{selected.passed}</Chip> },
          { label: '실패', value: <Chip severity={selected.failed > 10 ? 'danger' : 'warning'}>{selected.failed}</Chip> },
          { label: '생성', value: selected.generatedAt },
          { label: '주요 실패 항목', value: '5.2.5 특권 컨테이너, 5.7.3 보안 컨텍스트' },
        ]}
      />
    )}
    </>
  );
}

/* ═══ Cost Management ══════════════════ */
export function CostManagement() {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [selected, setSelected] = useState<CostLike | null>(null);

  return (
    <>
      <PageHeader title="비용 관리" sub="클러스터·네임스페이스별 비용을 분석합니다." />
      <TabList
        tabs={[
          { key: 'chart', label: '차트 보기' },
          { key: 'table', label: '테이블 보기' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'chart' ? (
        <div className="pl-grid-cards">
          {COST_ROWS.map((c) => (
            <div key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
            <Card>
              <div style={{ fontWeight: 600 }}>{c.cluster}</div>
              <div className="co-stat">{c.total}</div>
              <div className="co-bars">
                {[
                  { label: 'CPU', v: c.cpu },
                  { label: '메모리', v: c.memory },
                  { label: '스토리지', v: c.storage },
                ].map((b) => (
                  <div key={b.label} className="co-bar">
                    <span style={{ width: 70 }}>{b.label}</span>
                    <div className="track">
                      <div
                        className="fill"
                        style={{
                          width: `${Math.min(95, parseFloat(b.v.slice(1)) / 1.2)}%`,
                          background: 'var(--color-fill-primary)',
                        }}
                      />
                    </div>
                    <span>{b.v}</span>
                  </div>
                ))}
              </div>
            </Card>
            </div>
          ))}
        </div>
      ) : (
        <Table headers={['클러스터', 'CPU', '메모리', '스토리지', '합계']}>
          {COST_ROWS.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => setSelected(c)}>
              <td style={{ fontWeight: 600 }}>{c.cluster}</td>
              <td>{c.cpu}</td>
              <td>{c.memory}</td>
              <td>{c.storage}</td>
              <td style={{ fontWeight: 600 }}>{c.total}</td>
            </tr>
          ))}
        </Table>
      )}
      <CostModal row={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/* ═══ 404 ══════════════════════════════ */
export function ConsoleNotFound() {
  const params = useParams();
  return (
    <EmptyState
      title="페이지를 찾을 수 없습니다"
      message={`경로: ${params['*'] ?? ''} — 사이드바에서 다른 섹션을 선택해 주세요.`}
    />
  );
}
