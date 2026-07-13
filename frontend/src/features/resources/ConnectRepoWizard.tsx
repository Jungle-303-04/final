import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useCreateApplication,
  useRepositoryBranches,
  useRepositoryManifestCandidates,
  useRepositoryManifestValidation,
  useRepositoryProbe,
  type RepositoryManifestCandidate,
} from '@/features/repo/api';
import { useClusters } from '@/features/cluster/api';
import { useIsAdmin } from '@/features/auth/api';
import { RegisterClusterWizard } from '@/features/resources/RegisterClusterWizard';
import { useConsolePath } from '@/features/console/ui';
import type { Application, Cluster } from '@/shared/lib/types';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  KeyValueList,
  Modal,
  Select,
  Skeleton,
  cx,
  useToast,
} from '@/ui';

const STEPS = ['레포', '배포 대상', '확인'];
const PROBEABLE_REPO = /^([\w.-]+\/[\w.-]+|https?:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+|git@[^:\s]+:[^/\s]+\/[^/\s]+(?:\.git)?)$/;
const CONNECTED_STATUSES = new Set<Cluster['connection_status']>(['connected', 'online']);

export function ConnectRepoWizard({
  open,
  onClose,
  onCreated,
  navigateAfterCreate = true,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (applications: Application[]) => void;
  navigateAfterCreate?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [repoRef, setRepoRef] = useState('');
  const [branch, setBranch] = useState('');
  const [manifestSelection, setManifestSelection] = useState('');
  const [selectedClusterIds, setSelectedClusterIds] = useState<string[]>([]);
  const [creationConfirmed, setCreationConfirmed] = useState(false);
  const [clusterWizardOpen, setClusterWizardOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const clustersQ = useClusters();
  const create = useCreateApplication();
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const admin = useIsAdmin();
  const toast = useToast();

  const trimmedRepoRef = repoRef.trim();
  const refOk = PROBEABLE_REPO.test(trimmedRepoRef);
  const probeQ = useRepositoryProbe(trimmedRepoRef, open && refOk);
  const normalizedRepoRef = probeQ.data?.normalized_repo_ref || '';
  const branchesQ = useRepositoryBranches(normalizedRepoRef, open && Boolean(probeQ.data?.reachable && normalizedRepoRef));
  const selectedBranch = branch || branchesQ.data?.default_branch || probeQ.data?.default_branch || '';
  const manifestsQ = useRepositoryManifestCandidates(normalizedRepoRef, selectedBranch, open && Boolean(normalizedRepoRef && selectedBranch && probeQ.data?.reachable));
  const candidates = useMemo(() => manifestsQ.data?.candidates ?? [], [manifestsQ.data?.candidates]);
  const selectedCandidate = candidates.find((candidate) => repositoryManifestCandidateValue(candidate) === manifestSelection);
  const manifestPath = selectedCandidate?.path ?? '';
  const validationQ = useRepositoryManifestValidation(
    normalizedRepoRef,
    selectedBranch,
    manifestPath,
    selectedCandidate?.source_type ?? '',
    open && Boolean(normalizedRepoRef && selectedBranch && manifestPath && selectedCandidate),
  );
  const clusters = useMemo(() => clustersQ.data ?? [], [clustersQ.data]);
  const deployableClusters = useMemo(() => clusters.filter(isDeployableCluster), [clusters]);
  const selectedClusters = useMemo(
    () => selectedClusterIds.map((id) => clusters.find((cluster) => cluster.cluster_id === id)).filter((cluster): cluster is Cluster => Boolean(cluster)),
    [clusters, selectedClusterIds],
  );
  const name = normalizedRepoRef.split('/')[1] ?? '';
  const validation = validationQ.data;
  const manifestNamespace = firstManifestNamespace(validation?.resources ?? []);
  const manifestAccepted = Boolean(validation?.valid);
  const repoStepReady = Boolean(probeQ.data?.reachable && selectedBranch && manifestPath && manifestAccepted);
  const allDeployableSelected = deployableClusters.length > 0 && selectedClusterIds.length === deployableClusters.length;

  const reset = () => {
    setStep(0);
    setRepoRef('');
    setBranch('');
    setManifestSelection('');
    setSelectedClusterIds([]);
    setCreationConfirmed(false);
    setSubmitError('');
    setClusterWizardOpen(false);
    create.reset();
    onClose();
  };

  useEffect(() => {
    setBranch('');
    setManifestSelection('');
    setSubmitError('');
  }, [trimmedRepoRef]);

  useEffect(() => {
    if (!open || branch) return;
    const defaultBranch = branchesQ.data?.branches.find((item) => item.default)?.name;
    const firstBranch = branchesQ.data?.branches[0]?.name;
    const next = defaultBranch || branchesQ.data?.default_branch || probeQ.data?.default_branch || firstBranch || '';
    if (next) setBranch(next);
  }, [branch, branchesQ.data, open, probeQ.data]);

  useEffect(() => {
    if (!open) return;
    if (candidates.length === 0) {
      if (manifestSelection) setManifestSelection('');
      return;
    }
    if (!candidates.some((candidate) => repositoryManifestCandidateValue(candidate) === manifestSelection)) {
      setManifestSelection(repositoryManifestCandidateValue(candidates[0]));
    }
  }, [candidates, manifestSelection, open]);

  useEffect(() => {
    const connectedIds = new Set(deployableClusters.map((cluster) => cluster.cluster_id));
    setSelectedClusterIds((ids) => ids.filter((id) => connectedIds.has(id)));
  }, [deployableClusters]);

  useEffect(() => {
    setCreationConfirmed(false);
  }, [manifestPath, normalizedRepoRef, selectedBranch, selectedClusterIds]);

  const toggleCluster = (cluster: Cluster) => {
    if (!isDeployableCluster(cluster)) return;
    setSubmitError('');
    setSelectedClusterIds((ids) => ids.includes(cluster.cluster_id)
      ? ids.filter((id) => id !== cluster.cluster_id)
      : [...ids, cluster.cluster_id]);
  };

  const toggleAllConnected = () => {
    setSubmitError('');
    setSelectedClusterIds(allDeployableSelected ? [] : deployableClusters.map((cluster) => cluster.cluster_id));
  };

  const submit = async () => {
    if (!selectedClusters.length || !selectedCandidate) return;
    setSubmitError('');
    try {
      const results = [];
      for (const cluster of selectedClusters) {
        const result = await create.mutateAsync({
          name,
          repo_ref: normalizedRepoRef,
          branch: selectedBranch,
          manifest_path: manifestPath,
          source_type: selectedCandidate.source_type,
          cluster_id: cluster.cluster_id,
          namespace: manifestNamespace,
          environment: cluster.environment,
        });
        results.push(result);
      }
      toast.push({
        tone: 'success',
        title: '배포 정의 생성 완료',
        description: deploymentSummary(selectedClusters),
      });
      onCreated?.(results);
      reset();
      if (navigateAfterCreate) nav(pathFor(`/repos/${results[0]?.application_id ?? ''}`));
    } catch (error) {
      setSubmitError(connectErrorMessage(error));
    }
  };

  return (
    <>
      <Modal
        open={open}
        title="배포 정의 추가"
        description="레포, 브랜치, manifest, 대상 클러스터를 하나의 배포 정의로 연결합니다"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) reset();
        }}
      >
        <div className="grid gap-5">
          <StepRail current={step} />

          {step === 0 && (
            <>
              <Card title="레포 검증" description="서버 검증을 통과한 레포만 다음 단계로 이동합니다">
                <div className="grid gap-4">
                  <Field label="repo_ref" error={repoRef && !refOk ? 'owner/name 또는 GitHub URL 형식이어야 합니다' : undefined}>
                    <Input value={repoRef} onChange={(event) => setRepoRef(event.target.value)} placeholder="owner/name" />
                  </Field>
                  {probeQ.isPending && <Skeleton lines={1} />}
                  {probeQ.data?.reachable && (
                    <Badge tone="success">
                      {probeQ.data.normalized_repo_ref}{probeQ.data.default_branch ? ` · 기본 ${probeQ.data.default_branch}` : ''}
                    </Badge>
                  )}
                  {probeQ.data && !probeQ.data.reachable && (
                    <p className="text-caption font-medium text-danger" role="alert">
                      확인 실패 - {probeQ.data.errors[0] ?? '레포에 접근할 수 없습니다'}
                    </p>
                  )}
                  {probeQ.isError && (
                    <p className="text-caption font-medium text-danger" role="alert">
                      확인 실패 - {(probeQ.error as Error).message}
                    </p>
                  )}
                </div>
              </Card>

              <Card title="브랜치와 manifest" description="manifest 후보는 source type과 path 조합으로 선택합니다">
                <div className="grid gap-4">
                  <Field label="브랜치">
                    {branchesQ.isPending ? <Skeleton lines={1} /> : (
                      <Select
                        value={selectedBranch}
                        disabled={!probeQ.data?.reachable || (branchesQ.data?.branches ?? []).length === 0}
                        onChange={(event) => {
                          setBranch(event.target.value);
                          setManifestSelection('');
                        }}
                      >
                        {(branchesQ.data?.branches ?? []).map((item) => (
                          <option key={item.name} value={item.name}>{item.name}{item.protected ? ' · 보호됨' : ''}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {branchesQ.isError && (
                    <p className="text-caption font-medium text-danger" role="alert">
                      브랜치 조회 실패 - {(branchesQ.error as Error).message}
                    </p>
                  )}

                  <Field label="manifest">
                    {manifestsQ.isPending ? <Skeleton lines={1} /> : (
                      <Select value={manifestSelection} disabled={candidates.length === 0} onChange={(event) => setManifestSelection(event.target.value)}>
                        {candidates.map((candidate) => (
                          <option key={repositoryManifestCandidateValue(candidate)} value={repositoryManifestCandidateValue(candidate)}>{candidate.display_name}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {manifestsQ.data?.warnings.map((warning) => (
                    <p key={warning} className="text-caption font-medium text-warning">{warning}</p>
                  ))}
                  {manifestsQ.isError && (
                    <p className="text-caption font-medium text-danger" role="alert">
                      manifest 조회 실패 - {(manifestsQ.error as Error).message}
                    </p>
                  )}

                  <ManifestValidationPanel validation={validation} loading={validationQ.isPending} error={validationQ.error} />
                </div>
              </Card>

              <div className="flex justify-end border-t border-border pt-4">
                <Button variant="primary" disabled={!repoStepReady} onClick={() => setStep(1)}>다음</Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Card
                title="배포 대상"
                description="에이전트가 연결된 target 클러스터만 선택할 수 있습니다"
                loading={clustersQ.isPending}
                error={clustersQ.isError ? clustersQ.error : null}
                onRetry={() => void clustersQ.refetch()}
              >
                {clusters.length === 0 || deployableClusters.length === 0 ? (
                  <EmptyState
                    title="배포하려면 연결된 클러스터가 필요합니다"
                    description={admin ? '클러스터를 등록하고 agent 연결이 완료되면 이 화면으로 돌아옵니다' : '관리자에게 연결된 클러스터 접근 권한을 요청하세요'}
                    action={admin ? <Button variant="primary" onClick={() => setClusterWizardOpen(true)}>클러스터 등록</Button> : undefined}
                  />
                ) : (
                  <div className="grid gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Badge tone="info">{selectedClusterIds.length.toLocaleString()}개 선택</Badge>
                      <Button size="sm" onClick={toggleAllConnected}>
                        {allDeployableSelected ? '전체 해제' : '전체 선택'}
                      </Button>
                    </div>
                    <div className="grid gap-2" role="list" aria-label="대상 클러스터">
                      {clusters.map((cluster) => {
                        const connected = isClusterConnected(cluster);
                        const management = isManagementCluster(cluster);
                        const deployable = isDeployableCluster(cluster);
                        const selected = selectedClusterIds.includes(cluster.cluster_id);
                        return (
                          <div
                            key={cluster.cluster_id}
                            className={cx(
                              'flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-bg p-3 sm:flex-row sm:items-center sm:justify-between',
                              selected && 'border-brand bg-raised',
                              !deployable && 'opacity-70',
                            )}
                            role="listitem"
                          >
                            <button
                              type="button"
                              disabled={!deployable}
                              aria-pressed={selected}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                              onClick={() => toggleCluster(cluster)}
                            >
                              <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-control border', selected ? 'border-brand bg-brand text-on-accent' : 'border-border text-text-muted')}>
                                {selected && <CheckIcon />}
                              </span>
                              <span className="grid min-w-0 gap-1">
                                <span className="truncate text-body font-semibold text-text-primary">{cluster.name}</span>
                                <span className="truncate text-caption text-text-muted">{cluster.cluster_id} · {cluster.environment || '환경 미지정'}</span>
                              </span>
                            </button>
                            <span className="flex shrink-0 flex-wrap items-center gap-2">
                              {management ? (
                                <Badge tone="info">관리 클러스터</Badge>
                              ) : (
                                <Badge tone={connected ? 'success' : 'warning'}>{connected ? '연결됨' : '에이전트 미연결'}</Badge>
                              )}
                              {!connected && !management && (
                                <Link className="text-label font-semibold text-brand hover:text-brand-hover" to={pathFor(`/clusters/${cluster.cluster_id}`)}>
                                  연결하러 가기
                                </Link>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
              <div className="flex justify-between border-t border-border pt-4">
                <Button onClick={() => setStep(0)}>이전</Button>
                <Button variant="primary" disabled={selectedClusterIds.length === 0} onClick={() => setStep(2)}>다음</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Card title="확인" description="선택한 연결 클러스터에만 배포 정의를 생성합니다">
                <GitOpsConnectionPreview
                  repoRef={normalizedRepoRef}
                  branch={selectedBranch}
                  candidate={selectedCandidate}
                  validation={validation}
                  clusters={selectedClusters}
                  namespace={manifestNamespace}
                />
                <KeyValueList
                  items={[
                    { label: '앱 이름', value: name },
                    { label: '레포', value: `${normalizedRepoRef}@${selectedBranch}` },
                    { label: 'manifest', value: manifestPath },
                    { label: '대상', value: deploymentSummary(selectedClusters) },
                    { label: '네임스페이스', value: manifestNamespace || '서버 정책' },
                  ]}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedClusters.map((cluster) => (
                    <Link key={cluster.cluster_id} to={pathFor(`/clusters/${cluster.cluster_id}`)} className="inline-flex">
                      <Badge tone="success">{cluster.name}</Badge>
                    </Link>
                  ))}
                </div>
                <div className="mt-4">
                  <Checkbox
                    checked={creationConfirmed}
                    onChange={(event) => setCreationConfirmed(event.target.checked)}
                    label="검증된 source와 target 연결을 확인했습니다"
                    description="이 작업은 즉시 배포가 아니라, 이후 GitOps 검토와 릴리스 플랜에서 사용할 배포 정의를 생성합니다."
                  />
                </div>
              </Card>
              {submitError && (
                <p className="text-caption font-medium text-danger" role="alert">{submitError}</p>
              )}
              <div className="flex justify-between border-t border-border pt-4">
                <Button onClick={() => setStep(1)}>이전</Button>
                <Button variant="primary" loading={create.isPending} disabled={selectedClusters.length === 0 || !creationConfirmed} onClick={() => void submit()}>배포 정의 생성</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <RegisterClusterWizard
        open={clusterWizardOpen}
        onClose={() => {
          setClusterWizardOpen(false);
          void clustersQ.refetch();
        }}
      />
    </>
  );
}

function GitOpsConnectionPreview({
  repoRef,
  branch,
  candidate,
  validation,
  clusters,
  namespace,
}: {
  repoRef: string;
  branch: string;
  candidate?: RepositoryManifestCandidate;
  validation: ReturnType<typeof useRepositoryManifestValidation>['data'];
  clusters: Cluster[];
  namespace?: string;
}) {
  const resources = validation?.resources ?? [];
  return (
    <div className="mb-4 grid gap-3 border-y border-border py-4" aria-label="GitOps source and target mapping">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <section className="grid gap-1 rounded-panel border border-border bg-bg p-3">
          <span className="text-caption font-semibold text-text-muted">Git source</span>
          <strong className="truncate text-body text-text-primary" title={repoRef}>{repoRef}</strong>
          <span className="truncate text-caption text-text-secondary">{branch} / {candidate?.path ?? 'manifest 미선택'}</span>
          <span className="text-caption text-text-muted">{candidate?.source_type ?? 'source type 미확인'}</span>
        </section>
        <div className="hidden items-center justify-center text-caption font-bold text-text-muted md:flex" aria-hidden="true">-&gt;</div>
        <section className="grid gap-2 rounded-panel border border-border bg-bg p-3">
          <span className="text-caption font-semibold text-text-muted">Deployment targets</span>
          <strong className="text-body text-text-primary">{clusters.length.toLocaleString()}개 연결 클러스터</strong>
          <div className="flex flex-wrap gap-1.5">
            {clusters.map((cluster) => (
              <Badge key={cluster.cluster_id} tone="success">{cluster.name || cluster.cluster_id}{cluster.environment ? ` / ${cluster.environment}` : ''}</Badge>
            ))}
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-text-secondary">
        <span>서버 검증 {validation?.valid ? '통과' : '확인 필요'}</span>
        <span>리소스 {resources.length.toLocaleString()}개</span>
        <span>네임스페이스 {namespace || '서버 정책'}</span>
        {resources.slice(0, 3).map((resource) => <span key={`${resource.kind}-${resource.name}`}>{resource.kind}/{resource.name}</span>)}
      </div>
    </div>
  );
}

function ManifestValidationPanel({
  validation,
  loading,
  error,
}: {
  validation: ReturnType<typeof useRepositoryManifestValidation>['data'];
  loading: boolean;
  error: unknown;
}) {
  if (loading) return <Skeleton lines={2} />;
  if (error) {
    return <p className="text-caption font-medium text-danger" role="alert">manifest 검증 실패 - {(error as Error).message}</p>;
  }
  if (!validation) {
    return <p className="text-body text-text-secondary">manifest를 선택하면 서버 검증 결과가 표시됩니다.</p>;
  }
  return (
    <div className="grid gap-3 rounded-panel border border-border bg-bg p-3">
      <KeyValueList
        items={[
          { label: '검증', value: validation.status === 'not_run' ? 'render 대기' : validation.valid ? '통과' : '확인 필요' },
          { label: '리소스', value: validation.resource_count.toLocaleString() },
          { label: '방식', value: validation.validation_mode },
        ]}
      />
      {validation.resources.length > 0 && (
        <p className="text-caption text-text-secondary">
          {validation.resources.slice(0, 4).map((resource) => `${resource.kind}/${resource.name}`).join(', ')}
          {validation.resources.length > 4 ? ` 외 ${validation.resources.length - 4}개` : ''}
        </p>
      )}
      {[...validation.warnings, ...validation.errors].slice(0, 3).map((message) => (
        <p key={message} className={cx('text-caption font-medium', validation.errors.includes(message) ? 'text-danger' : 'text-warning')}>
          {message}
        </p>
      ))}
    </div>
  );
}

function StepRail({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="레포 연결 단계">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="min-w-0">
            <div className={cx('h-2 rounded-control', done ? 'bg-success' : active ? 'bg-brand' : 'bg-raised')} />
            <p className={cx('mt-2 truncate text-caption font-semibold', active || done ? 'text-text-primary' : 'text-text-muted')}>{step}</p>
          </li>
        );
      })}
    </ol>
  );
}

function isClusterConnected(cluster: Cluster): boolean {
  return CONNECTED_STATUSES.has(cluster.connection_status);
}

function isManagementCluster(cluster: Cluster): boolean {
  return cluster.role === 'management';
}

function isDeployableCluster(cluster: Cluster): boolean {
  return isClusterConnected(cluster) && !isManagementCluster(cluster);
}

function deploymentSummary(clusters: Cluster[]): string {
  if (clusters.length === 0) return '선택 없음';
  if (clusters.length === 1) return `${clusters[0].name || clusters[0].cluster_id}에 배포`;
  return `${clusters[0].name || clusters[0].cluster_id} 외 ${clusters.length - 1}개에 배포`;
}

function connectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '요청 실패');
  if (message.includes('cluster_not_connected')) {
    return '연결되지 않은 클러스터는 배포 대상으로 사용할 수 없습니다. 클러스터 agent 연결 후 다시 시도하세요.';
  }
  return `연결 실패 - ${message}`;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M3.4 8.4 6.5 11.3 12.6 4.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function repositoryManifestCandidateValue(candidate: RepositoryManifestCandidate): string {
  return `${candidate.source_type}:${candidate.path}`;
}

function firstManifestNamespace(resources: { namespace?: string | null }[]): string | undefined {
  return resources.find((resource) => resource.namespace?.trim())?.namespace?.trim();
}
