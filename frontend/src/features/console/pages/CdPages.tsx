// CD 그룹: 클러스터/서비스/저장소/파이프라인/글로벌 서비스 + 상세
import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ConfirmModal,
  EmptyState,
  FormField,
  IconFrame,
  InfoTip,
  Input,
  LinkTabList,
  Modal,
  PageHeader,
  SaveButton,
  SearchInput,
  Table,
  TabList,
} from '@/plural-ui';
import { AwsIcon, CaretRightIcon, PlusIcon, PluralMarkIcon, SendIcon } from '@/plural-ui/icons';
import {
  ALERTS,
  CLUSTERS,
  genHistorySeries,
  getClusterMetrics,
  getK8sResources,
  GIT_REPOS,
  PIPELINES,
  SERVICES,
  type ConsoleCluster,
  type ConsoleService,
  type GitRepo,
  type K8sResource,
  type Pipeline,
} from '../api';
import { healthSeverity, statusSeverity } from '../ui';
import { useLiveStream, useLiveValue } from '../live';
import { clusterProject, Guard, usePermission, VisibleBadge, type ProjectId } from '../viewer';
import {
  CreateClusterWizard,
  EditRepoModal,
  GlobalServiceModal,
  ImportRepoModal,
  ObserverWizard,
  PipelineWizard,
  UpgradePrModal,
  type GlobalServiceDraft,
  type ObserverDraft,
  type PipelineDraft,
} from '../flows';
import {
  AlertInsightModal,
  ClusterFlyover,
  DeleteGuardModal,
  GenericDetailModal,
  K8sResourceModal,
  PermissionsModal,
  PipelineModal,
  type AlertLike,
} from '../popups';

/* ── CD 레이아웃 (상단 탭) ────────────── */
export function CdLayout() {
  return (
    <>
      <LinkTabList
        tabs={[
          { to: '/console/cd/clusters', label: '클러스터' },
          { to: '/console/cd/services', label: '서비스' },
          { to: '/console/cd/repos', label: 'Git 저장소' },
          { to: '/console/cd/pipelines', label: '파이프라인' },
          { to: '/console/cd/globalservices', label: '글로벌 서비스' },
          { to: '/console/cd/observers', label: '옵저버' },
        ]}
      />
      <Outlet />
    </>
  );
}

/* ── 클러스터 목록 ────────────────────── */
export function CdClusters() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ConsoleCluster | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [clusters, setClusters] = useState<ConsoleCluster[]>(CLUSTERS);
  const [detachFor, setDetachFor] = useState<ConsoleCluster | null>(null);
  const [guard, setGuard] = useState<{ name: string; refs: string[] } | null>(null);
  const permDefault = usePermission('default');
  const permPlatform = usePermission('platform');
  const permFor = (id: string) => (clusterProject(id) === 'platform' ? permPlatform : permDefault);

  const visible = clusters.filter((c) => permFor(c.id).canRead);
  const rows = visible.filter((c) => c.name.includes(q));

  const tryDetach = (c: ConsoleCluster) => {
    const refs = [...new Set(SERVICES.filter((s) => s.cluster === c.name).map((s) => s.name))];
    if (refs.length > 0) setGuard({ name: c.name, refs });
    else setDetachFor(c);
  };

  return (
    <>
      <div className="pl-toolbar">
        <div className="pl-row">
          <SearchInput value={q} onChange={setQ} placeholder="클러스터 검색" />
          <VisibleBadge shown={visible.length} total={clusters.length} unit="클러스터" />
        </div>
        <Guard allowed={permDefault.canCreate} reason={permDefault.createReason}>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 클러스터 생성
          </Button>
        </Guard>
      </div>
      <CreateClusterWizard open={createOpen} onClose={() => setCreateOpen(false)} />
      {visible.length === 0 ? (
        <EmptyState
          title="접근 권한이 없어요"
          message="클러스터를 보려면 프로젝트 접근 바인딩이 필요해요 — 관리자에게 요청하세요."
        />
      ) : (
        <Table headers={['클러스터', '공급자', '버전', '건강', '업그레이드', '노드', '팟', '']}>
          {rows.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => setSelected(c)}>
              <td>
                <div className="pl-cell">
                  <IconFrame size="md">
                    <PluralMarkIcon size={16} />
                  </IconFrame>
                  {c.name}
                </div>
              </td>
              <td>
                <div className="pl-cell">
                  <IconFrame size="md">
                    <AwsIcon size={22} />
                  </IconFrame>
                  {c.provider}
                </div>
              </td>
              <td>
                <span className="pl-code">{c.version}</span>
              </td>
              <td>
                <Chip severity={healthSeverity(c.health)}>{c.health}</Chip>
              </td>
              <td>
                <Chip severity={statusSeverity(c.upgrade)}>{c.upgrade}</Chip>
              </td>
              <td>{c.nodes}</td>
              <td>{c.pods}</td>
              <td>
                <div className="pl-rowactions" onClick={(e) => e.stopPropagation()}>
                  <Guard allowed={permFor(c.id).canWrite} reason={permFor(c.id).writeReason}>
                    <Button size="small" onClick={() => tryDetach(c)}>
                      분리
                    </Button>
                  </Guard>
                  <button
                    type="button"
                    className="pl-caretbtn"
                    onClick={() => navigate(`/console/cd/clusters/${c.id}`)}
                    aria-label="상세"
                  >
                    <CaretRightIcon size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <ClusterFlyover cluster={selected} onClose={() => setSelected(null)} />
      <ConfirmModal
        open={!!detachFor}
        title={`클러스터 분리 — ${detachFor?.name ?? ''}`}
        message="플릿에서 분리하면 이 콘솔에서 더 이상 관리되지 않아요. 클러스터의 워크로드 자체는 삭제되지 않습니다."
        confirmLabel="분리"
        destructive
        onConfirm={() => setClusters((list) => list.filter((x) => x.id !== detachFor?.id))}
        onClose={() => setDetachFor(null)}
      />
      {guard && (
        <DeleteGuardModal
          title={`클러스터 분리 — ${guard.name}`}
          reason={`이 클러스터에 배포된 서비스 ${guard.refs.length}개가 있어요.`}
          refs={guard.refs}
          hint="서비스를 먼저 옮기거나 제거한 뒤 분리하세요. 글로벌 서비스(monitoring, cluster-agent)는 CD → 글로벌 서비스에서 배포 대상을 조정하면 돼요."
          onClose={() => setGuard(null)}
        />
      )}
    </>
  );
}

/* ── 서비스 배포 모달 ─────────────────── */
function DeployServiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = ['서비스 속성', '저장소', 'Helm 값', '시크릿'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="서비스 배포"
      size="large"
      actions={
        <>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>이전</Button>}
          {step < steps.length - 1 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              다음
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>
              배포
            </Button>
          )}
        </>
      }
    >
      <div className="pl-row" style={{ marginBottom: 16 }}>
        {steps.map((s, i) => (
          <Chip key={s} severity={i === step ? 'info' : i < step ? 'success' : 'neutral'}>
            {i + 1}. {s}
          </Chip>
        ))}
      </div>
      {step === 0 && (
        <>
          <FormField label="서비스 이름">
            <Input placeholder="my-service" />
          </FormField>
          <FormField label="클러스터">
            <Input placeholder="클러스터01" />
          </FormField>
        </>
      )}
      {step === 1 && (
        <>
          <FormField label="Git 저장소">
            <Input placeholder="https://github.com/Jungle-303-04/final.git" />
          </FormField>
          <FormField label="경로">
            <Input placeholder="deploy/" />
          </FormField>
          <FormField label="레퍼런스">
            <Input placeholder="main" />
          </FormField>
        </>
      )}
      {step === 2 && (
        <FormField label="values.yaml 오버라이드">
          <div className="pl-codeblock">replicas: 2{'\n'}resources:{'\n'}  limits:{'\n'}    memory: 512Mi</div>
        </FormField>
      )}
      {step === 3 && (
        <FormField label="시크릿" hint="key=value 형식으로 입력하세요.">
          <Input placeholder="DATABASE_URL=..." />
        </FormField>
      )}
    </Modal>
  );
}

/* ── 서비스 목록 ──────────────────────── */
export function CdServices() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [deployOpen, setDeployOpen] = useState(false);
  const [services, setServices] = useState<ConsoleService[]>(SERVICES);
  const [pausedIds, setPausedIds] = useState<Set<string>>(new Set());
  const [deleteFor, setDeleteFor] = useState<ConsoleService | null>(null);
  const [guard, setGuard] = useState<{ name: string; refs: string[] } | null>(null);
  const permDefault = usePermission('default');
  const permPlatform = usePermission('platform');
  const permFor = (clusterName: string) =>
    clusterProject(clusterName) === 'platform' ? permPlatform : permDefault;

  const visible = services.filter((s) => permFor(s.cluster).canRead);
  const rows = visible.filter((s) => s.name.includes(q));

  const resync = (s: ConsoleService) =>
    setServices((list) =>
      list.map((x) => (x.id === s.id ? { ...x, status: '동기화 중', updatedAt: '방금 전' } : x)),
    );
  const togglePause = (s: ConsoleService) =>
    setPausedIds((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
  const tryDelete = (s: ConsoleService) => {
    const refs = PIPELINES.filter((p) => p.name.startsWith(s.name)).map((p) => p.name);
    if (refs.length > 0) setGuard({ name: s.name, refs });
    else setDeleteFor(s);
  };

  return (
    <>
      <div className="pl-toolbar">
        <div className="pl-row">
          <SearchInput value={q} onChange={setQ} placeholder="서비스 검색" />
          <VisibleBadge shown={visible.length} total={services.length} unit="서비스" />
        </div>
        <Guard allowed={permDefault.canWrite} reason={permDefault.writeReason}>
          <Button variant="primary" onClick={() => setDeployOpen(true)}>
            <PlusIcon size={14} /> 서비스 배포
          </Button>
        </Guard>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="접근 권한이 없어요"
          message="서비스를 보려면 프로젝트 접근 바인딩이 필요해요 — 관리자에게 요청하세요."
        />
      ) : (
        <Table headers={['서비스', '클러스터', '저장소', '레퍼런스', '상태', '에러', '업데이트', '']}>
          {rows.map((s) => {
            const paused = pausedIds.has(s.id);
            const perm = permFor(s.cluster);
            return (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td>{s.cluster}</td>
                <td>
                  <span className="pl-code">{s.repo}</span>
                </td>
                <td>
                  <span className="pl-code">{s.ref}</span>
                </td>
                <td>
                  <Chip severity={paused ? 'neutral' : statusSeverity(s.status)}>
                    {paused ? '일시정지' : s.status}
                  </Chip>
                </td>
                <td>{s.errors > 0 ? <Chip severity="danger">{s.errors}</Chip> : '—'}</td>
                <td>{s.updatedAt}</td>
                <td>
                  <div className="pl-rowactions">
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" disabled={paused} onClick={() => resync(s)}>
                        재동기화
                      </Button>
                    </Guard>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" onClick={() => togglePause(s)}>
                        {paused ? '재개' : '일시정지'}
                      </Button>
                    </Guard>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" destructive onClick={() => tryDelete(s)}>
                        삭제
                      </Button>
                    </Guard>
                    <button
                      type="button"
                      className="pl-caretbtn"
                      onClick={() => navigate(`/console/cd/services/${s.id}`)}
                      aria-label="상세"
                    >
                      <CaretRightIcon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <DeployServiceModal open={deployOpen} onClose={() => setDeployOpen(false)} />
      <ConfirmModal
        open={!!deleteFor}
        title={`서비스 삭제 — ${deleteFor?.name ?? ''}`}
        message="배포된 리소스가 클러스터에서 제거됩니다. Git 저장소의 소스는 남아요."
        confirmLabel="삭제"
        destructive
        onConfirm={() => setServices((list) => list.filter((x) => x.id !== deleteFor?.id))}
        onClose={() => setDeleteFor(null)}
      />
      {guard && (
        <DeleteGuardModal
          title={`서비스 삭제 — ${guard.name}`}
          reason={`이 서비스를 배포하는 파이프라인 ${guard.refs.length}개가 있어요.`}
          refs={guard.refs}
          hint="파이프라인을 먼저 삭제하거나 대상 서비스를 변경한 뒤 삭제하세요."
          onClose={() => setGuard(null)}
        />
      )}
    </>
  );
}

/* ── Git 저장소 ───────────────────────── */
/** 저장소의 소속 프로젝트: logo-inc(플랫폼 운영 조직) 저장소만 platform */
function repoProject(url: string): ProjectId {
  return url.includes('logo-inc') ? 'platform' : 'default';
}

export function CdRepos() {
  const [selected, setSelected] = useState<GitRepo | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [permsFor, setPermsFor] = useState<string | null>(null);
  const [repos, setRepos] = useState<GitRepo[]>(GIT_REPOS);
  const [editFor, setEditFor] = useState<GitRepo | null>(null);
  const [deleteFor, setDeleteFor] = useState<GitRepo | null>(null);
  const [guard, setGuard] = useState<{ name: string; refs: string[] } | null>(null);
  const permDefault = usePermission('default');
  const permPlatform = usePermission('platform');
  const permFor = (r: GitRepo) => (repoProject(r.url) === 'platform' ? permPlatform : permDefault);

  const visible = repos.filter((r) => permFor(r).canRead);

  const refServices = (r: GitRepo) => [
    ...new Set(SERVICES.filter((s) => r.url.includes(s.repo)).map((s) => s.name)),
  ];
  const pullNow = (r: GitRepo) =>
    setRepos((list) => list.map((x) => (x.id === r.id ? { ...x, pulledAt: '방금 전', health: '통과' } : x)));
  const tryDelete = (r: GitRepo) => {
    const refs = refServices(r);
    if (refs.length > 0) setGuard({ name: r.url, refs });
    else setDeleteFor(r);
  };

  return (
    <>
      <div className="pl-toolbar">
        <VisibleBadge shown={visible.length} total={repos.length} unit="저장소" />
        <Guard allowed={permDefault.canCreate} reason={permDefault.createReason}>
          <Button variant="primary" onClick={() => setImportOpen(true)}>
            <PlusIcon size={14} /> 저장소 가져오기
          </Button>
        </Guard>
      </div>
      <ImportRepoModal open={importOpen} onClose={() => setImportOpen(false)} />
      {visible.length === 0 ? (
        <EmptyState
          title="접근 권한이 없어요"
          message="저장소를 보려면 프로젝트 접근 바인딩이 필요해요 — 관리자에게 요청하세요."
        />
      ) : (
        <Table headers={['URL', '상태', '마지막 pull', '참조 서비스', '']}>
          {visible.map((r) => {
            const perm = permFor(r);
            return (
              <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                <td>
                  <span className="pl-code">{r.url}</span>
                </td>
                <td>
                  <Chip severity={statusSeverity(r.health)}>{r.health}</Chip>
                </td>
                <td>{r.pulledAt}</td>
                <td>{refServices(r).length > 0 ? `${refServices(r).length}개` : '—'}</td>
                <td>
                  <div className="pl-rowactions" onClick={(e) => e.stopPropagation()}>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" onClick={() => pullNow(r)}>
                        즉시 pull
                      </Button>
                    </Guard>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" onClick={() => setEditFor(r)}>
                        편집
                      </Button>
                    </Guard>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" destructive onClick={() => tryDelete(r)}>
                        제거
                      </Button>
                    </Guard>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {selected && (
        <GenericDetailModal
          title="Git 저장소"
          onClose={() => setSelected(null)}
          rows={[
            { label: 'URL', value: <span className="pl-code">{selected.url}</span> },
            { label: '상태', value: <Chip severity={statusSeverity(selected.health)}>{selected.health}</Chip> },
            { label: '마지막 pull', value: selected.pulledAt },
            { label: '인증', value: 'deploy key (읽기 전용)' },
            { label: '참조 서비스', value: `${SERVICES.filter((s) => selected.url.includes(s.repo)).length}개` },
          ]}
        >
          <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="primary"
              onClick={() => {
                const url = selected.url;
                setSelected(null);
                setPermsFor(url);
              }}
            >
              권한 관리
            </Button>
          </div>
        </GenericDetailModal>
      )}
      {permsFor && (
        <PermissionsModal
          resource={`저장소 ${permsFor.split('/').slice(-2).join('/').replace('.git', '')}`}
          onClose={() => setPermsFor(null)}
        />
      )}
      <EditRepoModal
        open={!!editFor}
        url={editFor?.url ?? ''}
        onClose={() => setEditFor(null)}
        onSubmit={() => {
          if (editFor) pullNow(editFor);
        }}
      />
      <ConfirmModal
        open={!!deleteFor}
        title="저장소 제거"
        message={
          <span>
            <span className="pl-code">{deleteFor?.url}</span> 연결을 제거합니다. 참조하는 서비스가
            없어 안전하게 제거할 수 있어요.
          </span>
        }
        confirmLabel="제거"
        destructive
        onConfirm={() => setRepos((list) => list.filter((x) => x.id !== deleteFor?.id))}
        onClose={() => setDeleteFor(null)}
      />
      {guard && (
        <DeleteGuardModal
          title="저장소 제거"
          reason={`이 저장소를 참조하는 서비스 ${guard.refs.length}개가 있어요.`}
          refs={guard.refs}
          hint="먼저 서비스의 저장소 설정을 변경하거나 서비스를 삭제한 뒤 제거하세요."
          onClose={() => setGuard(null)}
        />
      )}
    </>
  );
}

/* ── 파이프라인 ───────────────────────── */
export function CdPipelines() {
  const [selected, setSelected] = useState<Pipeline | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>(PIPELINES);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<Pipeline | null>(null);
  const [deleteFor, setDeleteFor] = useState<Pipeline | null>(null);
  const [guard, setGuard] = useState<Pipeline | null>(null);
  const perm = usePermission('default');

  const tryDelete = (p: Pipeline) => {
    if (p.status === '진행 중') setGuard(p);
    else setDeleteFor(p);
  };

  if (!perm.canRead)
    return (
      <EmptyState
        title="접근 권한이 없어요"
        message="파이프라인을 보려면 프로젝트 접근 바인딩이 필요해요 — 관리자에게 요청하세요."
      />
    );

  return (
    <>
      <div className="pl-toolbar">
        <span />
        <Guard allowed={perm.canCreate} reason={perm.createReason}>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 파이프라인 생성
          </Button>
        </Guard>
      </div>
      <Table headers={['파이프라인', '스테이지', '상태', '']}>
        {pipelines.map((p) => (
          <tr key={p.id} className="clickable" onClick={() => setSelected(p)}>
            <td style={{ fontWeight: 600 }}>{p.name}</td>
            <td>
              <div className="pl-row">
                {p.stages.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
            </td>
            <td>
              <Chip severity={statusSeverity(p.status)}>{p.status}</Chip>
            </td>
            <td>
              <div className="pl-rowactions" onClick={(e) => e.stopPropagation()}>
                <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                  <Button size="small" onClick={() => setEditFor(p)}>
                    편집
                  </Button>
                </Guard>
                <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                  <Button size="small" destructive onClick={() => tryDelete(p)}>
                    삭제
                  </Button>
                </Guard>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <PipelineModal pipeline={selected} onClose={() => setSelected(null)} />
      <PipelineWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(d: PipelineDraft) =>
          setPipelines((list) => [
            ...list,
            {
              id: `p-${Date.now()}`,
              name: d.name.trim() || 'new-pipeline',
              stages: d.stages.length > 0 ? d.stages : ['dev'],
              status: '대기',
            },
          ])
        }
      />
      {editFor && (
        <PipelineWizard
          open
          initial={{ name: editFor.name, stages: editFor.stages, gate: '수동 승인', approver: '우녕' }}
          onClose={() => setEditFor(null)}
          onSubmit={(d: PipelineDraft) => {
            setPipelines((list) =>
              list.map((x) =>
                x.id === editFor.id
                  ? { ...x, name: d.name.trim() || x.name, stages: d.stages.length > 0 ? d.stages : x.stages }
                  : x,
              ),
            );
            setEditFor(null);
          }}
        />
      )}
      <ConfirmModal
        open={!!deleteFor}
        title={`파이프라인 삭제 — ${deleteFor?.name ?? ''}`}
        message="파이프라인 정의만 삭제됩니다. 이미 배포된 서비스에는 영향이 없어요."
        confirmLabel="삭제"
        destructive
        onConfirm={() => setPipelines((list) => list.filter((x) => x.id !== deleteFor?.id))}
        onClose={() => setDeleteFor(null)}
      />
      {guard && (
        <DeleteGuardModal
          title={`파이프라인 삭제 — ${guard.name}`}
          reason="실행 중인 파이프라인은 삭제할 수 없어요."
          refs={guard.stages}
          hint="진행 중인 승격이 끝나거나 중단된 뒤 다시 시도하세요."
          onClose={() => setGuard(null)}
        />
      )}
    </>
  );
}

type GlobalSvc = { name: string; target: string; status: string; updatedAt: string };

const GLOBAL_SVCS: GlobalSvc[] = [
  { name: 'monitoring', target: '전체 20개 클러스터', status: '건강함', updatedAt: '1시간 전' },
  { name: 'cluster-agent', target: '전체 20개 클러스터', status: '건강함', updatedAt: '30분 전' },
  { name: 'cert-manager', target: 'prod 태그 (7개)', status: '동기화 중', updatedAt: '10분 전' },
];

/** 삭제 가드(I7): 플릿 운영에 필수이거나 다른 리소스가 참조하는 글로벌 서비스 */
function globalSvcRefs(name: string): { refs: string[]; hint: string } | null {
  if (name === 'cluster-agent')
    return {
      refs: ['클러스터 연결 20개 (에이전트)'],
      hint: '에이전트는 콘솔-클러스터 연결 그 자체예요. 삭제하면 전 클러스터가 연결 해제됩니다 — 클러스터 분리로만 제거할 수 있어요.',
    };
  if (name === 'monitoring')
    return {
      refs: ['console-helm-watch 옵저버', '히트맵·메트릭 수집'],
      hint: '옵저버와 메트릭 수집이 이 서비스에 의존해요. 먼저 옵저버를 삭제하면 제거할 수 있어요.',
    };
  return null;
}

export function CdGlobalServices() {
  const [items, setItems] = useState<GlobalSvc[]>(GLOBAL_SVCS);
  const [selectedG, setSelectedG] = useState<GlobalSvc | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<GlobalSvc | null>(null);
  const [deleteFor, setDeleteFor] = useState<GlobalSvc | null>(null);
  const [guard, setGuard] = useState<{ name: string; refs: string[]; hint: string } | null>(null);
  // 글로벌 서비스는 플릿 전체 배포 = platform 프로젝트의 관리 영역
  const perm = usePermission('platform');

  const draftToRow = (d: GlobalServiceDraft): Pick<GlobalSvc, 'name' | 'target'> => ({
    name: d.name.trim(),
    target: d.targetType === '전체 클러스터' ? '전체 20개 클러스터' : `${d.tag?.trim()} 태그`,
  });
  const rowToDraft = (g: GlobalSvc): GlobalServiceDraft => ({
    name: g.name,
    targetType: g.target.startsWith('전체') ? '전체 클러스터' : '태그 선택',
    tag: g.target.startsWith('전체') ? 'prod' : g.target.split(' ')[0],
  });
  const tryDelete = (g: GlobalSvc) => {
    const blocked = globalSvcRefs(g.name);
    if (blocked) setGuard({ name: g.name, ...blocked });
    else setDeleteFor(g);
  };

  if (!perm.canRead)
    return (
      <EmptyState
        title="접근 권한이 없어요"
        message="글로벌 서비스는 플릿 전체에 배포되는 리소스라 platform 프로젝트 접근이 필요해요."
      />
    );

  return (
    <>
      <div className="pl-toolbar">
        <span />
        <Guard allowed={perm.canCreate} reason={perm.createReason}>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 글로벌 서비스 생성
          </Button>
        </Guard>
      </div>
      <Table headers={['글로벌 서비스', '배포 대상', '상태', '업데이트', '']}>
        {items.map((g) => (
          <tr key={g.name} className="clickable" onClick={() => setSelectedG(g)}>
            <td style={{ fontWeight: 600 }}>{g.name}</td>
            <td>
              <Chip>{g.target}</Chip>
            </td>
            <td>
              <Chip severity={statusSeverity(g.status)}>{g.status}</Chip>
            </td>
            <td>{g.updatedAt}</td>
            <td>
              <div className="pl-rowactions" onClick={(e) => e.stopPropagation()}>
                <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                  <Button size="small" onClick={() => setEditFor(g)}>
                    편집
                  </Button>
                </Guard>
                <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                  <Button size="small" destructive onClick={() => tryDelete(g)}>
                    삭제
                  </Button>
                </Guard>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {selectedG && (
        <GenericDetailModal
          title={`글로벌 서비스 — ${selectedG.name}`}
          onClose={() => setSelectedG(null)}
          rows={[
            { label: '배포 대상', value: <Chip>{selectedG.target}</Chip> },
            { label: '상태', value: <Chip severity={statusSeverity(selectedG.status)}>{selectedG.status}</Chip> },
            { label: '업데이트', value: selectedG.updatedAt },
            { label: '재조정 정책', value: '드리프트 시 자동 재동기화' },
          ]}
        />
      )}
      <GlobalServiceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(d) =>
          setItems((list) => [...list, { ...draftToRow(d), status: '동기화 중', updatedAt: '방금 전' }])
        }
      />
      {editFor && (
        <GlobalServiceModal
          open
          initial={rowToDraft(editFor)}
          onClose={() => setEditFor(null)}
          onSubmit={(d) => {
            setItems((list) =>
              list.map((x) => (x.name === editFor.name ? { ...x, ...draftToRow(d), updatedAt: '방금 전' } : x)),
            );
            setEditFor(null);
          }}
        />
      )}
      <ConfirmModal
        open={!!deleteFor}
        title={`글로벌 서비스 삭제 — ${deleteFor?.name ?? ''}`}
        message="대상 클러스터 전체에서 이 서비스가 제거됩니다."
        confirmLabel="삭제"
        destructive
        onConfirm={() => setItems((list) => list.filter((x) => x.name !== deleteFor?.name))}
        onClose={() => setDeleteFor(null)}
      />
      {guard && (
        <DeleteGuardModal
          title={`글로벌 서비스 삭제 — ${guard.name}`}
          reason="이 서비스에 의존하는 리소스가 있어요."
          refs={guard.refs}
          hint={guard.hint}
          onClose={() => setGuard(null)}
        />
      )}
    </>
  );
}

type ObserverRow = ObserverDraft & { polled: string; paused: boolean; project: ProjectId };

const OBSERVERS: ObserverRow[] = [
  {
    name: 'console-helm-watch',
    kind: 'helm',
    target: 'logo-inc/console',
    interval: '5분',
    polled: '5분 전',
    action: 'monitoring 자동 업데이트',
    paused: false,
    project: 'platform',
  },
  {
    name: 'agent-image-watch',
    kind: 'oci',
    target: 'ghcr.io/jungle-303-04/cluster-agent',
    interval: '5분',
    polled: '10분 전',
    action: 'PR 생성',
    paused: false,
    project: 'default',
  },
];

export function CdObservers() {
  const [items, setItems] = useState<ObserverRow[]>(OBSERVERS);
  const [selected, setSelected] = useState<ObserverRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<ObserverRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<ObserverRow | null>(null);
  const permDefault = usePermission('default');
  const permPlatform = usePermission('platform');
  const permFor = (o: ObserverRow) => (o.project === 'platform' ? permPlatform : permDefault);

  const visible = items.filter((o) => permFor(o).canRead);

  const pollNow = (o: ObserverRow) =>
    setItems((list) => list.map((x) => (x.name === o.name ? { ...x, polled: '방금 전' } : x)));
  const togglePause = (o: ObserverRow) =>
    setItems((list) => list.map((x) => (x.name === o.name ? { ...x, paused: !x.paused } : x)));

  return (
    <>
      <div className="pl-toolbar">
        <VisibleBadge shown={visible.length} total={items.length} unit="옵저버" />
        <Guard allowed={permDefault.canCreate} reason={permDefault.createReason}>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 옵저버 생성
          </Button>
        </Guard>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="접근 권한이 없어요"
          message="옵저버를 보려면 프로젝트 접근 바인딩이 필요해요 — 관리자에게 요청하세요."
        />
      ) : (
        <Table headers={['옵저버', '감시 대상', '주기', '마지막 폴링', '액션', '상태', '']}>
          {visible.map((o) => {
            const perm = permFor(o);
            return (
              <tr key={o.name} className="clickable" onClick={() => setSelected(o)}>
                <td style={{ fontWeight: 600 }}>{o.name}</td>
                <td>
                  <span className="pl-code">{`${o.kind}: ${o.target}`}</span>
                </td>
                <td>{o.interval}</td>
                <td>{o.polled}</td>
                <td>
                  <Chip>{o.action}</Chip>
                </td>
                <td>
                  <Chip severity={o.paused ? 'neutral' : 'success'}>{o.paused ? '일시정지' : '감시 중'}</Chip>
                </td>
                <td>
                  <div className="pl-rowactions" onClick={(e) => e.stopPropagation()}>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" disabled={o.paused} onClick={() => pollNow(o)}>
                        즉시 폴링
                      </Button>
                    </Guard>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" onClick={() => togglePause(o)}>
                        {o.paused ? '재개' : '일시정지'}
                      </Button>
                    </Guard>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" onClick={() => setEditFor(o)}>
                        편집
                      </Button>
                    </Guard>
                    <Guard allowed={perm.canWrite} reason={perm.writeReason}>
                      <Button size="small" destructive onClick={() => setDeleteFor(o)}>
                        삭제
                      </Button>
                    </Guard>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {selected && (
        <GenericDetailModal
          title={`옵저버 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '감시 대상', value: <span className="pl-code">{`${selected.kind}: ${selected.target}`}</span> },
            { label: '폴링 주기', value: selected.interval },
            { label: '마지막 폴링', value: selected.polled },
            { label: '트리거 액션', value: <Chip>{selected.action}</Chip> },
            {
              label: '상태',
              value: (
                <Chip severity={selected.paused ? 'neutral' : 'success'}>
                  {selected.paused ? '일시정지' : '감시 중'}
                </Chip>
              ),
            },
            { label: '최근 감지', value: 'v0.12.1 → 변경 없음' },
          ]}
        />
      )}
      <ObserverWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(d) => {
          setItems((list) => [
            ...list,
            {
              ...d,
              name: d.name.trim() || `watch-${list.length + 1}`,
              polled: '방금 전',
              paused: false,
              project: 'default',
            },
          ]);
          setCreateOpen(false);
        }}
      />
      {editFor && (
        <ObserverWizard
          open
          initial={editFor}
          onClose={() => setEditFor(null)}
          onSubmit={(d) => {
            setItems((list) =>
              list.map((x) => (x.name === editFor.name ? { ...x, ...d, name: d.name.trim() || x.name } : x)),
            );
            setEditFor(null);
          }}
        />
      )}
      <ConfirmModal
        open={!!deleteFor}
        title={`옵저버 삭제 — ${deleteFor?.name ?? ''}`}
        message="감시가 중단됩니다. 이미 생성된 PR이나 업데이트에는 영향이 없어요."
        confirmLabel="삭제"
        destructive
        onConfirm={() => setItems((list) => list.filter((x) => x.name !== deleteFor?.name))}
        onClose={() => setDeleteFor(null)}
      />
    </>
  );
}

/* ── 클러스터 상세 ────────────────────── */
export function CdClusterDetail() {
  const { clusterId } = useParams();
  const c = CLUSTERS.find((x) => x.id === clusterId) ?? CLUSTERS[0];
  const [manageOpen, setManageOpen] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={
          <span className="pl-row">
            <IconFrame size="lg">
              <PluralMarkIcon size={20} />
            </IconFrame>
            {c.name}
          </span>
        }
        sub={`${c.provider} · ${c.version} · 마지막 핑 ${c.pingedAt}`}
        actions={
          <>
            <Chip severity={healthSeverity(c.health)}>건강 {c.health}</Chip>
            <Button onClick={() => setPermsOpen(true)}>권한</Button>
            <Button onClick={() => setManageOpen(true)}>클러스터 관리</Button>
          </>
        }
      />
      {manageOpen && (
        <GenericDetailModal
          title={`클러스터 관리 — ${c.name}`}
          onClose={() => setManageOpen(false)}
          rows={[
            { label: 'kubeconfig', value: <span className="pl-code">logo cd credentials {c.id}</span> },
            { label: '에이전트 버전', value: <span className="pl-code">v0.12.1</span> },
            { label: '태그', value: <Chip>{c.id.startsWith('prod') ? 'prod' : 'managed'}</Chip> },
          ]}
        >
          <div className="pl-row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button size="small">에이전트 재시작</Button>
            <Button size="small">태그 편집</Button>
            <Button size="small" destructive>
              클러스터 분리
            </Button>
          </div>
        </GenericDetailModal>
      )}
      {permsOpen && <PermissionsModal resource={`클러스터 ${c.name}`} onClose={() => setPermsOpen(false)} />}
      <LinkTabList
        tabs={[
          { to: `/console/cd/clusters/${clusterId}/overview`, label: '개요' },
          { to: `/console/cd/clusters/${clusterId}/services`, label: '서비스' },
          { to: `/console/cd/clusters/${clusterId}/metrics`, label: '메트릭' },
          { to: `/console/cd/clusters/${clusterId}/details`, label: '상세' },
          { to: `/console/cd/clusters/${clusterId}/nodes`, label: '노드' },
          { to: `/console/cd/clusters/${clusterId}/pods`, label: '팟' },
          { to: `/console/cd/clusters/${clusterId}/network`, label: '네트워크' },
          { to: `/console/cd/clusters/${clusterId}/insights`, label: '인사이트' },
          { to: `/console/cd/clusters/${clusterId}/alerts`, label: '알림' },
          { to: `/console/cd/clusters/${clusterId}/upgrades`, label: '업그레이드' },
          { to: `/console/cd/clusters/${clusterId}/logs`, label: '로그' },
          { to: `/console/cd/clusters/${clusterId}/addons`, label: '애드온' },
        ]}
      />
      <Outlet context={{ cluster: c }} />
    </>
  );
}

export function ClusterServices() {
  const { clusterId } = useParams();
  const c = CLUSTERS.find((x) => x.id === clusterId);
  const rows = SERVICES.filter((s) => !c || s.cluster === c.name);
  const navigate = useNavigate();

  if (rows.length === 0) return <EmptyState title="이 클러스터에 서비스가 없습니다" />;
  return (
    <Table headers={['서비스', '레퍼런스', '상태', '에러', '업데이트', '']}>
      {rows.map((s) => (
        <tr key={s.id}>
          <td style={{ fontWeight: 600 }}>{s.name}</td>
          <td>
            <span className="pl-code">{s.ref}</span>
          </td>
          <td>
            <Chip severity={statusSeverity(s.status)}>{s.status}</Chip>
          </td>
          <td>{s.errors > 0 ? <Chip severity="danger">{s.errors}</Chip> : '—'}</td>
          <td>{s.updatedAt}</td>
          <td>
            <div className="pl-rowactions">
              <button
                type="button"
                className="pl-caretbtn"
                onClick={() => navigate(`/console/cd/services/${s.id}`)}
                aria-label="상세"
              >
                <CaretRightIcon size={14} />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
}

/** 시계열 스파크라인 (30분) */
function Sparkline({ series, danger }: { series: number[]; danger?: boolean }) {
  const w = 280;
  const h = 64;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - (v / 100) * h}`).join(' ');
  const color = danger ? 'var(--color-text-danger)' : 'var(--color-fill-primary)';
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity="0.12" />
    </svg>
  );
}

/** 라이브 차트 카드 — 값 + 흐르는 차트 (area/gauge/bar) */
type MetricDef = {
  key: string;
  label: string;
  base: number;
  vol: number;
  unit?: string;
  max?: number;
  kind?: 'area' | 'gauge' | 'bar' | 'donut' | 'heat';
  dangerAt?: number;
};

function LiveChartCard({ def, onClick, range = '실시간' }: { def: MetricDef; onClick?: () => void; range?: string }) {
  const { label, base, vol, unit = '%', max = 100, kind = 'area', dangerAt = unit === '%' ? 85 : Infinity } = def;
  const isLive = range === '실시간';
  const liveV = useLiveValue(base, vol, { max, decimals: 1 });
  const liveSeries = useLiveStream((liveV / max) * 100);
  // 기간 선택 시: 기간마다 다른 과거 데이터 (실제 콘솔의 Prometheus 범위 쿼리처럼)
  const histSeries = genHistorySeries(def.key, range, (base / max) * 100, (vol / max) * 100 * 1.5);
  const series = isLive ? liveSeries : histSeries;
  const v = isLive ? liveV : (histSeries.reduce((a, b) => a + b, 0) / histSeries.length / 100) * max;
  const isDanger = v > dangerAt;
  const color = isDanger ? 'var(--color-text-danger)' : 'var(--color-fill-primary)';

  return (
    <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      <Card>
        <div className="pl-row pl-row--between">
          <span className="pl-muted">{label}</span>
          <span className="co-stat" style={{ margin: 0, fontSize: 18, color: isDanger ? 'var(--color-text-danger)' : undefined }}>
            {v.toFixed(1)}
            {unit}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          {kind === 'area' && <Sparkline series={series} danger={isDanger} />}
          {kind === 'gauge' && (
            <svg width="100%" height="72" viewBox="0 0 100 56">
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--color-fill-one)" strokeWidth="9" strokeLinecap="round" />
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke={color}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${(v / max) * 126} 126`}
              />
              <text x="50" y="50" textAnchor="middle" fontSize="11" fill="var(--color-text)">
                {Math.round((v / max) * 100)}%
              </text>
            </svg>
          )}
          {kind === 'bar' && (
            <svg width="100%" height="64" viewBox="0 0 280 64" preserveAspectRatio="none">
              {series.filter((_, i) => i % 7 === 0).map((s, i) => (
                <rect key={i} x={i * 20 + 3} y={64 - (s / 100) * 60} width="14" height={(s / 100) * 60} rx="2" fill={color} opacity="0.75" />
              ))}
            </svg>
          )}
          {kind === 'donut' && (
            <svg width="100%" height="72" viewBox="0 0 100 72">
              <circle cx="50" cy="36" r="26" fill="none" stroke="var(--color-fill-one)" strokeWidth="8" />
              <circle
                cx="50"
                cy="36"
                r="26"
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(v / max) * 163} 163`}
                transform="rotate(-90 50 36)"
              />
              <text x="50" y="40" textAnchor="middle" fontSize="12" fill="var(--color-text)">
                {Math.round((v / max) * 100)}%
              </text>
            </svg>
          )}
          {kind === 'heat' && (
            <svg width="100%" height="64" viewBox="0 0 280 64" preserveAspectRatio="none">
              {series.filter((_, i) => i % 5 === 0).map((s, i) =>
                [0, 1, 2].map((row) => {
                  const intensity = Math.max(0.06, Math.min(0.95, (s / 100) * (1 - row * 0.25)));
                  return (
                    <rect
                      key={`${i}-${row}`}
                      x={i * 14 + 2}
                      y={row * 21 + 2}
                      width="11"
                      height="18"
                      rx="2"
                      fill={color}
                      opacity={intensity}
                    />
                  );
                }),
              )}
            </svg>
          )}
        </div>
      </Card>
    </div>
  );
}

/** 차트 클릭 → 확대 모달 (통계 포함) */
function MetricDetailModal({ def, onClose }: { def: MetricDef | null; onClose: () => void }) {
  const d = def ?? { key: '', label: '', base: 0, vol: 0 };
  const v = useLiveValue(d.base, d.vol, { max: d.max ?? 100, decimals: 1 });
  const series = useLiveStream((v / (d.max ?? 100)) * 100, { sampleMs: 100, size: 200 });
  if (!def) return null;
  const abs = series.map((s) => (s / 100) * (def.max ?? 100));
  const minV = Math.min(...abs);
  const maxV = Math.max(...abs);
  const avgV = abs.reduce((a, b) => a + b, 0) / abs.length;

  return (
    <Modal open onClose={onClose} size="large" title={`메트릭 — ${def.label}`} actions={<Button onClick={onClose}>닫기</Button>}>
      <div className="pl-row pl-row--between" style={{ marginBottom: 8 }}>
        <span className="co-stat" style={{ margin: 0 }}>
          {v.toFixed(1)}
          {def.unit ?? '%'}
        </span>
        <div className="pl-row">
          <Chip>최소 {minV.toFixed(1)}</Chip>
          <Chip severity="info">평균 {avgV.toFixed(1)}</Chip>
          <Chip severity="warning">최대 {maxV.toFixed(1)}</Chip>
        </div>
      </div>
      <div style={{ height: 160 }}>
        <svg width="100%" height="160" viewBox="0 0 400 160" preserveAspectRatio="none">
          <polyline
            points={series.map((s, i) => `${(i / (series.length - 1)) * 400},${160 - (s / 100) * 150}`).join(' ')}
            fill="none"
            stroke="var(--color-fill-primary)"
            strokeWidth="2"
          />
          <polygon
            points={`0,160 ${series.map((s, i) => `${(i / (series.length - 1)) * 400},${160 - (s / 100) * 150}`).join(' ')} 400,160`}
            fill="var(--color-fill-primary)"
            opacity="0.12"
          />
        </svg>
      </div>
      <p className="pl-muted" style={{ margin: '8px 0 0' }}>
        20초 윈도우 · 100ms 샘플링 · Prometheus 쿼리(mock): <span className="pl-code">avg({def.key})</span>
      </p>
    </Modal>
  );
}

const METRIC_RANGES = ['실시간', '1시간', '6시간', '24시간'] as const;

export function ClusterMetrics() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const m = getClusterMetrics(clusterId);
  const unhealthy = clusterId === 'cluster02';
  const [range, setRange] = useState<(typeof METRIC_RANGES)[number]>('실시간');
  const [zoomed, setZoomed] = useState<MetricDef | null>(null);

  // CloudWatch풍 카테고리별 메트릭 정의
  const sections: { title: string; metrics: MetricDef[] }[] = [
    {
      title: '컴퓨트',
      metrics: [
        { key: 'cpu_utilization', label: 'CPU 사용률', base: m.cpu, vol: 9 },
        { key: 'memory_utilization', label: '메모리 사용률', base: m.mem, vol: 5 },
        { key: 'cpu_throttled', label: 'CPU 스로틀', base: unhealthy ? 14 : 2, vol: 3, dangerAt: 10 },
        { key: 'load_average', label: '로드 애버리지', base: unhealthy ? 8.2 : 3.1, vol: 1.4, unit: '', max: 16 },
      ],
    },
    {
      title: '네트워크',
      metrics: [
        { key: 'network_rx', label: '수신', base: unhealthy ? 34 : 22, vol: 9, unit: ' MB/s', max: 80 },
        { key: 'network_tx', label: '송신', base: unhealthy ? 18 : 12, vol: 6, unit: ' MB/s', max: 80 },
        { key: 'requests_per_sec', label: '요청률', base: 1240, vol: 220, unit: ' req/s', max: 3000 },
        { key: 'p99_latency', label: 'p99 지연', base: unhealthy ? 240 : 88, vol: 40, unit: 'ms', max: 600, dangerAt: 200 },
      ],
    },
    {
      title: '스토리지',
      metrics: [
        { key: 'disk_utilization', label: '디스크 사용률', base: m.disk, vol: 2, kind: 'gauge' },
        { key: 'disk_iops', label: 'IOPS', base: 340 + m.disk * 4, vol: 90, unit: ' ops', max: 2000 },
        { key: 'disk_throughput', label: '처리량', base: 84, vol: 22, unit: ' MB/s', max: 400 },
        { key: 'pv_usage', label: 'PV 사용량', base: 61, vol: 1.5, kind: 'donut' },
      ],
    },
    {
      title: '컨트롤 플레인',
      metrics: [
        { key: 'apiserver_p99', label: 'API 서버 p99', base: unhealthy ? 320 : 95, vol: 55, unit: 'ms', max: 800, dangerAt: 250 },
        { key: 'etcd_fsync', label: 'etcd fsync', base: 12, vol: 4, unit: 'ms', max: 100, dangerAt: 50 },
        { key: 'scheduler_latency', label: '스케줄링 지연', base: unhealthy ? 45 : 9, vol: 8, unit: 'ms', max: 200, dangerAt: 30 },
        { key: 'watch_events', label: '워치 이벤트 (노드×시간 히트맵)', base: 420, vol: 120, unit: '/s', max: 1500, kind: 'heat' },
      ],
    },
    {
      title: '워크로드',
      metrics: [
        { key: 'pod_restarts', label: '컨테이너 재시작', base: unhealthy ? 6 : 0.4, vol: unhealthy ? 3 : 0.5, unit: '/h', max: 20, kind: 'bar', dangerAt: 3 },
        { key: 'oom_events', label: 'OOM 이벤트', base: unhealthy ? 3 : 0.1, vol: unhealthy ? 2 : 0.2, unit: '/h', max: 10, kind: 'bar', dangerAt: 1 },
        { key: 'pending_pods', label: '대기 중 팟', base: unhealthy ? 7 : 1, vol: 2, unit: '개', max: 30, kind: 'bar', dangerAt: 5 },
        { key: 'nats_queue_depth', label: 'NATS 대기열', base: unhealthy ? 480 : 60, vol: 90, unit: '', max: 2000, dangerAt: 300 },
      ],
    },
  ];

  return (
    <div className="pl-stack">
      <div className="pl-toolbar">
        <TabList tabs={METRIC_RANGES.map((r) => ({ key: r, label: r }))} value={range} onChange={setRange} />
        <InfoTip>차트를 클릭하면 확대 보기와 최소/평균/최대 통계를 볼 수 있어요.</InfoTip>
      </div>

      {sections.map((sec) => (
        <div key={sec.title}>
          <div style={{ fontWeight: 600, margin: '4px 0 10px' }}>{sec.title}</div>
          <div className="pl-grid-cards">
            {sec.metrics.map((def) => (
              <LiveChartCard key={`${def.key}-${range}`} def={def} range={range} onClick={() => setZoomed(def)} />
            ))}
          </div>
        </div>
      ))}
      <MetricDetailModal def={zoomed} onClose={() => setZoomed(null)} />

      <div className="co-charts">
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>노드별 사용률 (상위 5)</div>
          <Table headers={['노드', 'CPU', '메모리', '팟']}>
            {m.topNodes.map((n) => (
              <tr key={n.name}>
                <td>
                  <span className="pl-code">{n.name}</span>
                </td>
                <td>
                  <Chip severity={n.cpu > 80 ? 'danger' : n.cpu > 60 ? 'warning' : 'success'}>{n.cpu}%</Chip>
                </td>
                <td>
                  <Chip severity={n.mem > 85 ? 'danger' : n.mem > 65 ? 'warning' : 'success'}>{n.mem}%</Chip>
                </td>
                <td>{n.pods}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>네임스페이스별 사용량</div>
          <Table headers={['네임스페이스', 'CPU 요청', '메모리 요청', '팟']}>
            {[
              { ns: 'default', cpu: '12.4 코어', mem: '28.2 GiB', pods: 600 },
              { ns: 'infra', cpu: '5.1 코어', mem: '16.8 GiB', pods: 200 },
              { ns: 'kube-system', cpu: '2.2 코어', mem: '6.4 GiB', pods: 200 },
            ].map((r) => (
              <tr key={r.ns}>
                <td>{r.ns}</td>
                <td>{r.cpu}</td>
                <td>{r.mem}</td>
                <td>{r.pods}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}

/* ── 노드 탭 ──────────────────────────── */
export function ClusterNodes() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<K8sResource | null>(null);
  const [nodePage, setNodePage] = useState(0);
  const nodes = getK8sResources(clusterId, 'nodes');
  const notReady = nodes.filter((n) => n.status === 'NotReady').length;

  return (
    <>
      <div className="pl-toolbar">
        <div className="pl-row">
          <Chip severity="success">준비됨 {nodes.length - notReady}</Chip>
          {notReady > 0 && <Chip severity="danger">NotReady {notReady}</Chip>}
        </div>
        <Button size="small" onClick={() => navigate(`/console/kubernetes/${clusterId}/nodes`)}>
          쿠버네티스에서 전체 보기
        </Button>
      </div>
      <Table headers={['노드', '상태', '용량', '테인트', '나이']}>
        {nodes.slice(nodePage * 25, (nodePage + 1) * 25).map((n, i) => (
          <tr key={n.name} className="clickable" onClick={() => setSelected(n)}>
            <td>
              <span className="pl-code">{n.name}</span>
            </td>
            <td>
              <Chip severity={statusSeverity(n.status)}>{n.status}</Chip>
            </td>
            <td>4 vCPU · 16 GiB</td>
            <td>{(nodePage * 25 + i) % 20 === 0 ? <Chip severity="warning">dedicated=infra</Chip> : '—'}</td>
            <td>{n.age}</td>
          </tr>
        ))}
      </Table>
      <div className="pl-row" style={{ justifyContent: 'center', marginTop: 12 }}>
        <Button size="small" disabled={nodePage === 0} onClick={() => setNodePage(nodePage - 1)}>
          이전
        </Button>
        <span className="pl-muted">
          {nodePage + 1} / {Math.ceil(nodes.length / 25)} 페이지 (전체 {nodes.length}개)
        </span>
        <Button size="small" disabled={(nodePage + 1) * 25 >= nodes.length} onClick={() => setNodePage(nodePage + 1)}>
          다음
        </Button>
      </div>
      <K8sResourceModal resource={selected} kind="nodes" onClose={() => setSelected(null)} />
    </>
  );
}

/* ── 팟 탭 ────────────────────────────── */
export function ClusterPods() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<K8sResource | null>(null);
  const [podPage, setPodPage] = useState(0);
  const [nsFilter, setNsFilter] = useState<'all' | 'default' | 'infra' | 'kube-system'>('all');
  const pods = getK8sResources(clusterId, 'pods').filter(
    (p) => nsFilter === 'all' || p.namespace === nsFilter,
  );
  const bad = pods.filter((p) => p.status !== '실행 중');
  const sorted = [...bad, ...pods.filter((p) => p.status === '실행 중')];
  const view = sorted.slice(podPage * 25, (podPage + 1) * 25);

  return (
    <>
      <div className="pl-toolbar">
        <div className="pl-row">
          <Chip severity="success">실행 중 {(pods.length - bad.length).toLocaleString()}</Chip>
          {bad.length > 0 && <Chip severity="danger">문제 {bad.length}</Chip>}
          <TabList
            tabs={[
              { key: 'all', label: '전체 NS' },
              { key: 'default', label: 'default' },
              { key: 'infra', label: 'infra' },
              { key: 'kube-system', label: 'kube-system' },
            ]}
            value={nsFilter}
            onChange={(v) => {
              setNsFilter(v);
              setPodPage(0);
            }}
          />
        </div>
        <Button size="small" onClick={() => navigate(`/console/kubernetes/${clusterId}/pods`)}>
          쿠버네티스에서 전체 보기
        </Button>
      </div>
      <Table headers={['팟', '네임스페이스', '상태', '준비', '재시작']}>
        {view.map((p) => (
          <tr key={p.name} className="clickable" onClick={() => setSelected(p)}>
            <td style={{ fontWeight: 600 }}>{p.name}</td>
            <td>{p.namespace}</td>
            <td>
              <Chip severity={statusSeverity(p.status)}>{p.status}</Chip>
            </td>
            <td>{p.ready}</td>
            <td>{p.restarts}</td>
          </tr>
        ))}
      </Table>
      <div className="pl-row" style={{ justifyContent: 'center', marginTop: 12 }}>
        <Button size="small" disabled={podPage === 0} onClick={() => setPodPage(podPage - 1)}>
          이전
        </Button>
        <span className="pl-muted">
          {podPage + 1} / {Math.max(1, Math.ceil(sorted.length / 25))} 페이지 (전체 {sorted.length.toLocaleString()}개 · 문제 팟 우선)
        </span>
        <Button size="small" disabled={(podPage + 1) * 25 >= sorted.length} onClick={() => setPodPage(podPage + 1)}>
          다음
        </Button>
      </div>
      <K8sResourceModal resource={selected} kind="pods" onClose={() => setSelected(null)} />
    </>
  );
}

/* ── 네트워크 이벤트 실시간 피드 ──────── */
const NET_EVENT_POOL = [
  { type: '연결', msg: 'api-gateway → nats.infra:4222 신규 연결', sev: 'success' as const },
  { type: '연결', msg: 'realtime-gateway ← 클라이언트 WS 접속', sev: 'success' as const },
  { type: 'DNS', msg: 'coredns 조회 postgres.infra.svc (2ms)', sev: 'neutral' as const },
  { type: '인그레스', msg: 'GET /api/dashboard 200 (38ms)', sev: 'success' as const },
  { type: '인그레스', msg: 'POST /api/commands 201 (52ms)', sev: 'success' as const },
  { type: '정책', msg: 'deny-all-default 차단: 외부 → nats:4222', sev: 'warning' as const },
  { type: '재시도', msg: 'dashboard-worker → postgres 연결 재시도', sev: 'danger' as const },
];

function NetworkEventFeed({ unhealthy }: { unhealthy: boolean }) {
  const [events, setEvents] = useState<{ t: string; type: string; msg: string; sev: 'success' | 'neutral' | 'warning' | 'danger' }[]>([]);

  useEffect(() => {
    let alive = true;
    const push = () => {
      if (!alive) return;
      const pool = unhealthy ? NET_EVENT_POOL : NET_EVENT_POOL.filter((e) => e.sev !== 'danger');
      const e = pool[Math.floor(Math.random() * pool.length)];
      setEvents((prev) => [{ t: new Date().toISOString().slice(11, 19), ...e }, ...prev.slice(0, 7)]);
      setTimeout(push, 900 + Math.random() * 1600);
    };
    push();
    return () => {
      alive = false;
    };
  }, [unhealthy]);

  return (
    <Card>
      <div className="pl-row pl-row--between" style={{ marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>네트워크 이벤트 (실시간)</span>
        <span className="pl-muted">새 이벤트가 자동으로 추가됩니다</span>
      </div>
      <div className="pl-stack" style={{ gap: 8 }}>
        {events.length === 0 && <span className="pl-muted">이벤트 대기 중…</span>}
        {events.map((e, i) => (
          <div key={`${e.t}-${i}`} className="pl-row pl-row--between" style={{ opacity: i === 0 ? 1 : 0.85 }}>
            <div className="pl-row">
              <Chip severity={e.sev}>{e.type}</Chip>
              <span style={{ fontSize: 13 }}>{e.msg}</span>
            </div>
            <span className="pl-muted">{e.t}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── 네트워크 탭 ──────────────────────── */
export function ClusterNetwork() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const svcs = getK8sResources(clusterId, 'services');
  const ingresses = getK8sResources(clusterId, 'ingresses');
  const unhealthy = clusterId === 'cluster02';

  // 라이브 티커 (부드러운 사인파 노이즈)
  const rps = useLiveValue(1240, 220, { max: 5000, decimals: 0 });
  const latency = useLiveValue(unhealthy ? 96 : 42, unhealthy ? 24 : 10, { max: 400, decimals: 1 });
  const err = useLiveValue(unhealthy ? 2.4 : 0.1, unhealthy ? 0.9 : 0.07, { max: 10, decimals: 2 });

  return (
    <div className="pl-stack">
      <div className="pl-grid-cards">
        <Card>
          <div className="pl-muted">인그레스 트래픽 (실시간)</div>
          <div className="co-stat">{Math.round(rps).toLocaleString()} req/s</div>
        </Card>
        <Card>
          <div className="pl-muted">평균 지연 (실시간)</div>
          <div className="co-stat" style={latency > 80 ? { color: 'var(--color-text-warning)' } : undefined}>
            {latency.toFixed(1)}ms
          </div>
        </Card>
        <Card>
          <div className="pl-muted">5xx 비율 (실시간)</div>
          <div className="co-stat" style={err > 1 ? { color: 'var(--color-text-danger)' } : undefined}>
            {err.toFixed(2)}%
          </div>
        </Card>
      </div>
      <div className="co-charts">
        <LiveChartCard def={{ key: 'net_rx', label: '수신 트래픽 (실시간)', base: unhealthy ? 34 : 22, vol: 9, unit: ' MB/s', max: 80 }} />
        <LiveChartCard def={{ key: 'net_tx', label: '송신 트래픽 (실시간)', base: unhealthy ? 18 : 12, vol: 6, unit: ' MB/s', max: 80 }} />
      </div>
      <NetworkEventFeed unhealthy={unhealthy} />
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>상위 통신 (Top talkers)</div>
        <Table headers={['소스', '대상', '프로토콜', '트래픽']}>
          {[
            { src: 'api-gateway', dst: 'nats.infra', proto: 'TCP 4222', traffic: '8.2 MB/s' },
            { src: 'realtime-gateway', dst: '클라이언트 (WS)', proto: 'WSS 443', traffic: '5.4 MB/s' },
            { src: 'dashboard-worker', dst: 'postgres.infra', proto: 'TCP 5432', traffic: unhealthy ? '0.1 MB/s' : '2.1 MB/s' },
            { src: 'alloy', dst: 'loki.infra', proto: 'HTTP 3100', traffic: '1.8 MB/s' },
          ].map((t, i) => (
            <tr key={i}>
              <td>
                <span className="pl-code">{t.src}</span>
              </td>
              <td>
                <span className="pl-code">{t.dst}</span>
              </td>
              <td>
                <Chip>{t.proto}</Chip>
              </td>
              <td>{t.traffic}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>서비스 ({svcs.length})</div>
        <Table headers={['서비스', '유형', '네임스페이스']}>
          {svcs.map((s) => (
            <tr key={s.name}>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td>
                <Chip>{s.status}</Chip>
              </td>
              <td>{s.namespace}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>인그레스</div>
        <Table headers={['인그레스', '클래스', '네임스페이스']}>
          {ingresses.map((i) => (
            <tr key={i.name}>
              <td style={{ fontWeight: 600 }}>{i.name}</td>
              <td>
                <Chip>{i.status}</Chip>
              </td>
              <td>{i.namespace}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* ── 인사이트 탭 ──────────────────────── */
export function ClusterInsights() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const unhealthy = clusterId === 'cluster02';

  return (
    <div className="pl-stack">
      <Card>
        <div className="pl-row pl-row--between">
          <div className="pl-row" style={{ fontWeight: 600 }}>
            <SendIcon size={14} /> AI 인사이트
          </div>
          <span className="pl-muted">10분 전 갱신</span>
        </div>
        <p className="pl-sub" style={{ margin: '12px 0 0' }}>
          {unhealthy
            ? 'dashboard-worker의 반복적인 OOMKilled이 클러스터 건강 점수를 34까지 끌어내리고 있어요. 메모리 리밋 상향(PR#128)을 머지하면 점수가 70+로 회복될 것으로 예상합니다. 또한 k8s v1.29는 EOL이 임박해 업그레이드가 필요해요.'
            : '주요 이상 징후가 없어요. 리소스 사용률이 안정적이고 모든 서비스가 정상 동기화 상태입니다.'}
        </p>
      </Card>
      <Table headers={['컴포넌트', '심각도', '요약']}>
        {(unhealthy
          ? [
              { name: 'dashboard-worker', sev: '심각', summary: 'OOMKilled 반복 — 메모리 리밋 부족' },
              { name: 'node ip-10-0-8', sev: '경고', summary: 'MemoryPressure 상태' },
              { name: 'kube-apiserver', sev: '경고', summary: 'v1.29 EOL 임박' },
            ]
          : [{ name: '전체', sev: '정상', summary: '이상 없음' }]
        ).map((i) => (
          <tr key={i.name}>
            <td>
              <span className="pl-code">{i.name}</span>
            </td>
            <td>
              <Chip severity={i.sev === '심각' ? 'danger' : i.sev === '경고' ? 'warning' : 'success'}>{i.sev}</Chip>
            </td>
            <td>{i.summary}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ── 업그레이드 탭 ────────────────────── */
export function ClusterUpgrades() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const c = CLUSTERS.find((x) => x.id === clusterId) ?? CLUSTERS[0];
  const behind = c.upgrade !== '최신';
  const [prOpen, setPrOpen] = useState(false);

  return (
    <div className="pl-stack">
      <div className="pl-grid-cards">
        <Card>
          <div className="pl-muted">현재 버전</div>
          <div className="co-stat">
            <span className="pl-code">{c.version}</span>
          </div>
        </Card>
        <Card>
          <div className="pl-muted">최신 버전</div>
          <div className="co-stat">
            <span className="pl-code">v1.32.4</span>
          </div>
        </Card>
        <Card>
          <div className="pl-muted">상태</div>
          <div style={{ marginTop: 8 }}>
            <Chip severity={statusSeverity(c.upgrade)}>{c.upgrade}</Chip>
          </div>
        </Card>
      </div>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>업그레이드 사전 점검</div>
        <Table headers={['항목', '상태', '비고']}>
          {[
            { item: '폐기 예정 API 사용', status: behind ? '경고' : '통과', note: behind ? 'batch/v1beta1 CronJob 2건' : '없음' },
            { item: '애드온 호환성', status: '통과', note: 'cert-manager, ingress-nginx 호환 확인' },
            { item: 'PDB 설정', status: '통과', note: '모든 핵심 서비스에 PDB 존재' },
            { item: '노드 여유 용량', status: behind ? '경고' : '통과', note: behind ? '서지 노드 1개 필요' : '충분' },
          ].map((r) => (
            <tr key={r.item}>
              <td>{r.item}</td>
              <td>
                <Chip severity={r.status === '통과' ? 'success' : 'warning'}>{r.status}</Chip>
              </td>
              <td>{r.note}</td>
            </tr>
          ))}
        </Table>
        {behind && (
          <div className="pl-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="primary" onClick={() => setPrOpen(true)}>
              업그레이드 PR 생성
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>애드온 호환성 매트릭스</div>
        <Table headers={['애드온', '현재', 'v1.30', 'v1.31', 'v1.32']}>
          {[
            { name: 'cert-manager', cur: 'v1.15.2', ok: [true, true, true] },
            { name: 'ingress-nginx', cur: 'v1.11.1', ok: [true, true, false] },
            { name: 'metrics-server', cur: 'v0.7.1', ok: [true, true, true] },
            { name: 'external-dns', cur: 'v0.14.0', ok: [true, false, false] },
          ].map((a) => (
            <tr key={a.name}>
              <td style={{ fontWeight: 600 }}>{a.name}</td>
              <td>
                <span className="pl-code">{a.cur}</span>
              </td>
              {a.ok.map((ok, i) => (
                <td key={i}>
                  {ok ? <Chip severity="success">호환</Chip> : <Chip severity="warning">업데이트 필요</Chip>}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      </Card>
      <UpgradePrModal open={prOpen} onClose={() => setPrOpen(false)} cluster={c.name} />
    </div>
  );
}

export function ClusterDetails() {
  const { clusterId } = useParams();
  const c = CLUSTERS.find((x) => x.id === clusterId) ?? CLUSTERS[0];
  const unhealthy = c.id === 'cluster02';

  return (
    <div className="pl-stack">
      <div className="pl-grid-cards">
        <Card>
          <div className="pl-muted">메타데이터</div>
          <div style={{ marginTop: 8 }} className="pl-stack">
            {[
              ['배포판', 'EKS'],
              ['버전', c.version],
              ['리전', c.region],
              ['프로젝트', c.id === 'mgmt' ? 'platform' : 'default'],
              ['생성일', '2026-06-26'],
              ['API 엔드포인트', `https://${c.id}.gr7.${c.region}.eks.amazonaws.com`],
              ['서비스 CIDR', '10.100.0.0/16'],
              ['팟 CIDR', '10.0.0.0/16'],
              ['OIDC Issuer', `oidc.eks.${c.region}.amazonaws.com/id/…`],
            ].map(([k, v]) => (
              <div key={k} className="pl-row pl-row--between">
                <span>{k}</span>
                <span className="pl-code" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="pl-muted">용량</div>
          <div style={{ marginTop: 8 }} className="pl-stack">
            {[
              ['노드', `${c.nodes}개 (m5.xlarge)`],
              ['팟', `${c.pods.toLocaleString()} / ${(c.nodes * 17).toLocaleString()} (한도)`],
              ['총 vCPU', `${c.nodes * 4} 코어`],
              ['총 메모리', `${c.nodes * 16} GiB`],
              ['가용 영역', '3개 (a/b/c)'],
            ].map(([k, v]) => (
              <div key={k} className="pl-row pl-row--between">
                <span>{k}</span>
                <span className="pl-code">{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="pl-muted">레이블 / 태그</div>
          <div className="pl-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            <Chip>env={c.id.startsWith('prod') || c.id.startsWith('cluster') ? 'prod' : 'nonprod'}</Chip>
            <Chip>team=jungle-303</Chip>
            <Chip>managed-by=logo</Chip>
            <Chip>karpenter=enabled</Chip>
            <Chip severity="info">tier=managed</Chip>
          </div>
        </Card>
      </div>
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>클러스터 컨디션</div>
        <Table headers={['컨디션', '상태', '마지막 전환', '메시지']}>
          {[
            { cond: 'Ready', ok: true, at: '11일 전', msg: 'API 서버 정상 응답' },
            { cond: 'MemoryPressure', ok: !unhealthy, at: unhealthy ? '14분 전' : '11일 전', msg: unhealthy ? '노드 3개 메모리 압박' : '없음' },
            { cond: 'DiskPressure', ok: true, at: '11일 전', msg: '없음' },
            { cond: 'NetworkAvailable', ok: true, at: '11일 전', msg: 'CNI 정상' },
          ].map((r) => (
            <tr key={r.cond}>
              <td>
                <span className="pl-code">{r.cond}</span>
              </td>
              <td>
                <Chip severity={r.ok ? 'success' : 'danger'}>{r.ok ? 'True' : 'False'}</Chip>
              </td>
              <td>{r.at}</td>
              <td>{r.msg}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

export function ClusterAlerts() {
  const [selected, setSelected] = useState<AlertLike | null>(null);
  const [sevFilter, setSevFilter] = useState<'all' | '심각' | '경고'>('all');
  const [silencing, setSilencing] = useState<AlertLike | null>(null);
  const rows = ALERTS.filter((a) => sevFilter === 'all' || a.severity === sevFilter);

  return (
    <>
      <div className="pl-toolbar">
        <TabList
          tabs={[
            { key: 'all', label: `모두 (${ALERTS.length})` },
            { key: '심각', label: `심각 (${ALERTS.filter((a) => a.severity === '심각').length})` },
            { key: '경고', label: `경고 (${ALERTS.filter((a) => a.severity === '경고').length})` },
          ]}
          value={sevFilter}
          onChange={setSevFilter}
        />
        <span />
      </div>
      <Table headers={['알림', '심각도', '리소스', '발생', '']}>
        {rows.map((a) => (
          <tr key={a.id} className="clickable" onClick={() => setSelected(a)}>
            <td style={{ fontWeight: 600 }}>{a.name}</td>
            <td>
              <Chip severity={statusSeverity(a.severity)}>{a.severity}</Chip>
            </td>
            <td>
              <span className="pl-code">{a.resource}</span>
            </td>
            <td>{a.firedAt}</td>
            <td>
              <div className="pl-rowactions">
                <Button
                  size="small"
                  onClick={() => setSilencing(a)}
                >
                  음소거
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <AlertInsightModal alert={selected} onClose={() => setSelected(null)} />
      <ConfirmModal
        open={silencing !== null}
        title="알림 음소거"
        message={`${silencing?.name ?? ''} 알림을 24시간 동안 음소거할까요? 같은 리소스의 재발 알림도 억제됩니다.`}
        confirmLabel="음소거"
        onConfirm={() => {}}
        onClose={() => setSilencing(null)}
      />
    </>
  );
}

/* ── 로그 탭: 실시간 스트리밍 뷰어 ────── */
const LOG_TEMPLATES: { level: 'INFO' | 'WARN' | 'ERROR'; svc: string; msg: string }[] = [
  { level: 'INFO', svc: 'api-gateway', msg: 'GET /healthz 200 2ms trace=a3f8c1' },
  { level: 'INFO', svc: 'api-gateway', msg: 'POST /api/commands 201 41ms trace=b7e209 user=woonyong' },
  { level: 'INFO', svc: 'rca-worker', msg: 'consumed subject=rca.requested seq=48213 dur=12ms' },
  { level: 'INFO', svc: 'realtime-gateway', msg: 'ws_connections=24 rooms=7 backlog=0' },
  { level: 'INFO', svc: 'alert-worker', msg: 'routed alert=PodCrashLooping sink=slack-alerts 200' },
  { level: 'WARN', svc: 'command-worker', msg: 'nats request timeout=800ms retry=1/3 subject=command.execute' },
  { level: 'ERROR', svc: 'dashboard-worker', msg: 'container killed reason=OOMKilled limit=512Mi rss=531Mi restart=7' },
  { level: 'WARN', svc: 'api-gateway', msg: 'GET /api/dashboard 429 rate_limited ip=211.36.142.7' },
  { level: 'INFO', svc: 'cluster-agent', msg: 'heartbeat ok rev=96a049dc resources=214 drift=0' },
  { level: 'INFO', svc: 'postgres', msg: 'checkpoint complete: wrote 842 buffers (5.1%) sync=0.4s' },
];

export function ClusterLogs() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const unhealthy = clusterId === 'cluster02';
  const [lines, setLines] = useState<{ t: string; level: string; svc: string; msg: string }[]>([]);
  const [level, setLevel] = useState<'all' | 'INFO' | 'WARN' | 'ERROR'>('all');
  const [q, setQ] = useState('');
  const [paused, setPaused] = useState(false);

  // 실시간 로그 스트림 (0.6~1.4초 간격으로 새 라인)
  useEffect(() => {
    if (paused) return;
    let alive = true;
    const push = () => {
      if (!alive) return;
      const pool = unhealthy ? LOG_TEMPLATES : LOG_TEMPLATES.filter((l) => l.level !== 'ERROR');
      const tpl = pool[Math.floor(Math.random() * pool.length)];
      const now = new Date();
      setLines((prev) => [
        ...prev.slice(-120),
        { t: now.toISOString().slice(11, 19), level: tpl.level, svc: tpl.svc, msg: tpl.msg },
      ]);
      setTimeout(push, 600 + Math.random() * 800);
    };
    push();
    return () => {
      alive = false;
    };
  }, [paused, unhealthy]);

  const view = lines.filter(
    (l) => (level === 'all' || l.level === level) && (l.svc.includes(q) || l.msg.includes(q)),
  );

  return (
    <>
      <div className="pl-toolbar">
        <div className="pl-row">
          <TabList
            tabs={[
              { key: 'all', label: '전체' },
              { key: 'INFO', label: 'INFO' },
              { key: 'WARN', label: 'WARN' },
              { key: 'ERROR', label: 'ERROR' },
            ]}
            value={level}
            onChange={setLevel}
          />
          <SearchInput value={q} onChange={setQ} placeholder="서비스/메시지 검색" />
        </div>
        <Button size="small" onClick={() => setPaused(!paused)}>
          {paused ? '▶ 재개' : '⏸ 일시정지'}
        </Button>
      </div>
      <div className="pl-codeblock" style={{ minHeight: 320, maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
        <div>
          {view.map((l, i) => (
            <div key={i}>
              <span style={{ opacity: 0.5 }}>{l.t}</span>{' '}
              <span
                style={{
                  color:
                    l.level === 'ERROR'
                      ? 'var(--color-text-danger)'
                      : l.level === 'WARN'
                        ? 'var(--color-text-warning)'
                        : 'var(--color-text-success)',
                }}
              >
                {l.level.padEnd(5)}
              </span>{' '}
              <span style={{ opacity: 0.8 }}>{l.svc.padEnd(18)}</span> {l.msg}
            </div>
          ))}
          {view.length === 0 && <span style={{ opacity: 0.5 }}>스트리밍 대기 중…</span>}
        </div>
      </div>
    </>
  );
}

const ADDONS = [
  { name: 'cert-manager', version: 'v1.15.2', latest: 'v1.15.2', status: '건강함' },
  { name: 'ingress-nginx', version: 'v1.11.1', latest: 'v1.11.3', status: '건강함' },
  { name: 'metrics-server', version: 'v0.7.1', latest: 'v0.7.1', status: '건강함' },
  { name: 'external-dns', version: 'v0.14.0', latest: 'v0.14.2', status: '건강함' },
];

export function ClusterAddOns() {
  const [selected, setSelected] = useState<(typeof ADDONS)[number] | null>(null);
  return (
    <>
      <Table headers={['애드온', '설치 버전', '최신 버전', '상태']}>
        {ADDONS.map((a) => (
          <tr key={a.name} className="clickable" onClick={() => setSelected(a)}>
            <td style={{ fontWeight: 600 }}>{a.name}</td>
            <td>
              <span className="pl-code">{a.version}</span>
            </td>
            <td>
              {a.version === a.latest ? (
                <Chip severity="success">최신</Chip>
              ) : (
                <span className="pl-code">{a.latest}</span>
              )}
            </td>
            <td>
              <Chip severity="success">{a.status}</Chip>
            </td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title={`애드온 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '설치 버전', value: <span className="pl-code">{selected.version}</span> },
            { label: '최신 버전', value: <span className="pl-code">{selected.latest}</span> },
            { label: '상태', value: <Chip severity="success">{selected.status}</Chip> },
            { label: 'k8s 호환성', value: 'v1.29 – v1.32' },
            { label: '관리 방식', value: '글로벌 서비스로 자동 동기화' },
          ]}
        />
      )}
    </>
  );
}

/* ── 서비스 상세 ──────────────────────── */
export function CdServiceDetail() {
  const { serviceId } = useParams();
  const s = SERVICES.find((x) => x.id === serviceId) ?? SERVICES[0];
  const [resyncOpen, setResyncOpen] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={s.name}
        sub={`${s.cluster} · ${s.repo} @ ${s.ref}`}
        actions={
          <>
            <Chip severity={statusSeverity(s.status)}>{s.status}</Chip>
            <Button onClick={() => setPermsOpen(true)}>권한</Button>
            <Button onClick={() => setResyncOpen(true)}>재동기화</Button>
          </>
        }
      />
      {permsOpen && <PermissionsModal resource={`서비스 ${s.name}`} onClose={() => setPermsOpen(false)} />}
      <ConfirmModal
        open={resyncOpen}
        title="재동기화"
        message={`${s.name}을(를) Git 최신 상태로 강제 재동기화할까요? 드리프트가 있으면 덮어씁니다.`}
        confirmLabel="재동기화"
        onConfirm={() => {}}
        onClose={() => setResyncOpen(false)}
      />
      <LinkTabList
        tabs={[
          { to: `/console/cd/services/${serviceId}`, label: '컴포넌트', end: true },
          { to: `/console/cd/services/${serviceId}/errors`, label: '에러' },
          { to: `/console/cd/services/${serviceId}/logs`, label: '로그' },
          { to: `/console/cd/services/${serviceId}/revisions`, label: '리비전' },
          { to: `/console/cd/services/${serviceId}/settings`, label: '설정' },
        ]}
      />
      <Outlet context={{ service: s }} />
    </>
  );
}

const COMPONENTS = [
  { name: 'api-gateway', kind: 'Deployment', ns: 'default', status: '건강함' },
  { name: 'api-gateway', kind: 'Service', ns: 'default', status: '건강함' },
  { name: 'api-gateway-config', kind: 'ConfigMap', ns: 'default', status: '건강함' },
  { name: 'api-gateway-hpa', kind: 'HorizontalPodAutoscaler', ns: 'default', status: '건강함' },
];

export function ServiceComponents() {
  const [selected, setSelected] = useState<(typeof COMPONENTS)[number] | null>(null);
  return (
    <>
      <Table headers={['컴포넌트', '종류', '네임스페이스', '상태']}>
        {COMPONENTS.map((c, i) => (
          <tr key={i} className="clickable" onClick={() => setSelected(c)}>
            <td style={{ fontWeight: 600 }}>{c.name}</td>
            <td>
              <Chip>{c.kind}</Chip>
            </td>
            <td>{c.ns}</td>
            <td>
              <Chip severity="success">{c.status}</Chip>
            </td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title={`컴포넌트 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '종류', value: <Chip>{selected.kind}</Chip> },
            { label: '네임스페이스', value: selected.ns },
            { label: '상태', value: <Chip severity="success">{selected.status}</Chip> },
            { label: '드리프트', value: '없음 — Git 정의와 일치' },
            { label: '마지막 적용', value: '5분 전 (rev-14)' },
          ]}
        />
      )}
    </>
  );
}

export function ServiceErrors() {
  const { serviceId } = useParams();
  const s = SERVICES.find((x) => x.id === serviceId);
  if (!s || s.errors === 0)
    return <EmptyState title="에러 없음" message="이 서비스는 정상적으로 동기화되고 있어요." />;
  return (
    <Table headers={['소스', '메시지', '발생']}>
      <tr>
        <td>
          <Chip severity="danger">sync</Chip>
        </td>
        <td>Deployment dashboard-worker: 팟이 준비되지 않음 (CrashLoopBackOff)</td>
        <td>12분 전</td>
      </tr>
      <tr>
        <td>
          <Chip severity="danger">health</Chip>
        </td>
        <td>컨테이너 main: OOMKilled — 메모리 리밋 512Mi 초과 (7회 재시작)</td>
        <td>12분 전</td>
      </tr>
    </Table>
  );
}

export function ServiceLogs() {
  return (
    <div className="pl-codeblock" style={{ minHeight: 240 }}>
      2026-07-07T02:14:11Z INFO  uvicorn 요청 처리 200 GET /healthz{'\n'}
      2026-07-07T02:14:02Z INFO  NATS 연결 유지{'\n'}
      2026-07-07T02:13:48Z INFO  요청 처리 201 POST /api/commands
    </div>
  );
}

export function ServiceRevisions() {
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  return (
    <>
      <Table headers={['리비전', '레퍼런스', 'SHA', '배포 시각', '']}>
        {[
          { rev: 'rev-14', ref: 'main', sha: '96a049dc', at: '5분 전', current: true },
          { rev: 'rev-13', ref: 'main', sha: 'a8b86dcd', at: '어제', current: false },
          { rev: 'rev-12', ref: 'main', sha: '3e67121a', at: '2일 전', current: false },
        ].map((r) => (
          <tr key={r.rev}>
            <td style={{ fontWeight: 600 }}>{r.rev}</td>
            <td>
              <span className="pl-code">{r.ref}</span>
            </td>
            <td>
              <span className="pl-code">{r.sha}</span>
            </td>
            <td>{r.at}</td>
            <td>
              {r.current ? (
                <Chip severity="success">현재</Chip>
              ) : (
                <Button size="small" onClick={() => setRollingBack(r.rev)}>
                  롤백
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <ConfirmModal
        open={rollingBack !== null}
        title="리비전 롤백"
        message={`${rollingBack ?? ''}(으)로 롤백할까요? 현재 배포가 해당 리비전의 매니페스트로 되돌아갑니다.`}
        confirmLabel="롤백"
        onConfirm={() => {}}
        onClose={() => setRollingBack(null)}
      />
    </>
  );
}

export function ServiceSettings() {
  return (
    <Card>
      <FormField label="Git 저장소">
        <Input value="https://github.com/Jungle-303-04/final.git" />
      </FormField>
      <FormField label="경로">
        <Input value="deploy/" />
      </FormField>
      <FormField label="레퍼런스">
        <Input value="main" />
      </FormField>
      <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
        <SaveButton />
      </div>
    </Card>
  );
}
