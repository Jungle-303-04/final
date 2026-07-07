// 클러스터 등록 위저드 — provider discovery/preflight 기반 동적 등록 흐름
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import { Badge, Button, CodeBlock, copyToClipboard, Field, KeyValue, Modal, SearchInput, Skeleton, Stepper } from '@/shared/ui';
import { uiStore } from '@/shared/lib/ui-store';
import { queryClient } from '@/shared/lib/query';

const STEPS = ['프로바이더', '설정', '사전 점검', '발급'];
const DEFAULT_CLOUD_PROVIDER = 'existing-k8s';
const DEFAULT_DEPLOY_PROVIDER = 'manual-manifest';
const ONLINE_STATUSES = new Set(['connected', 'online']);

type ProviderBody = {
  key: string;
  label: string;
  status: string;
  unavailable_reason?: string | null;
};

type ImportCandidate = {
  cluster_id: string;
  name: string;
  source: string;
  cloud_provider: string;
  deploy_provider: string;
  kube_context?: string | null;
  external_handle?: string | null;
  console_url?: string | null;
  direct_apply_available: boolean;
  labels: Record<string, string>;
};

type RegistrationFlow = {
  cloud_provider: string;
  label: string;
  status: string;
  description: string;
  deploy_providers: ProviderBody[];
  default_deploy_provider: string;
  supports_import: boolean;
  unavailable_reason?: string | null;
  import_candidates: ImportCandidate[];
};

type DiscoveryResponse = {
  default_cloud_provider: string;
  default_deploy_provider: string;
  flows: RegistrationFlow[];
  import_candidates: ImportCandidate[];
};

type TargetPreflight = {
  valid: boolean;
  duplicate_cluster_id: boolean;
  provider_ready: boolean;
  agent_install_status: string;
  connection_status: string;
  kube_context_allowed?: boolean | null;
  errors: string[];
  warnings: string[];
  selected: Record<string, ProviderBody>;
  last_agent_id?: string | null;
  last_seen_at?: string | null;
};

type InstallResponse = {
  agent_token: string;
  install_manifest: string;
  install_command?: string;
};

export function RegisterClusterWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState(DEFAULT_CLOUD_PROVIDER);
  const [deployProvider, setDeployProvider] = useState(DEFAULT_DEPLOY_PROVIDER);
  const [kubeContext, setKubeContext] = useState('');
  const [selectedImportKey, setSelectedImportKey] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<InstallResponse | null>(null);
  const [closeGuard, setCloseGuard] = useState(false);

  const discovery = useQuery({
    queryKey: ['providers', 'cluster-discovery'],
    queryFn: () => get<DiscoveryResponse>('/providers/cluster-discovery'),
    enabled: open,
  });
  const flows = discovery.data?.flows ?? [];
  const selectedFlow = flows.find(flow => flow.cloud_provider === provider) ?? flows[0];
  const activeProvider = selectedFlow?.cloud_provider ?? provider;
  const deployOptions = useMemo(() => selectedFlow?.deploy_providers ?? [], [selectedFlow]);
  const selectedDeployOption = deployOptions.find(option => option.key === deployProvider);
  const selectedCandidate = selectedFlow?.import_candidates.find(candidate => candidateKey(candidate) === selectedImportKey);
  const filteredImportCandidates = useMemo(
    () => (selectedFlow?.import_candidates ?? []).filter(candidate => clusterImportCandidateMatches(candidate, candidateQuery)),
    [candidateQuery, selectedFlow],
  );
  const directApply = deployProvider === 'kube-context';

  const preflight = useMutation({
    mutationFn: () => post<TargetPreflight>('/targets/preflight', {
      cluster_id: clusterId,
      cloud_provider: activeProvider,
      deploy_provider: deployProvider,
      apply: directApply,
      kube_context: directApply && kubeContext ? kubeContext : undefined,
    }),
  });

  const register = useMutation({
    mutationFn: () => post<InstallResponse>('/targets', {
      cluster_id: clusterId,
      name: name || clusterId,
      environment: 'sandbox',
      apply: directApply,
      kube_context: directApply && kubeContext ? kubeContext : undefined,
      cloud_provider: activeProvider,
      deploy_provider: deployProvider,
    }),
    onSuccess: d => {
      setIssued(d);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      uiStore.getState().toast('ok', `클러스터 ${clusterId} 등록 완료 — 에이전트를 설치해주세요`);
    },
  });

  const connQ = useQuery({
    queryKey: ['cluster-conn', clusterId],
    queryFn: () => get<{ connection_status: string }>(`/clusters/${clusterId}/connection-status`),
    enabled: step === 3 && !!issued,
    refetchInterval: q => (isAgentOnline(q.state.data?.connection_status) ? false : 5000),
  });
  const connected = isAgentOnline(connQ.data?.connection_status);
  const slugOk = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(clusterId);
  const providerReady = selectedFlow?.status === 'available';
  const deployReady = selectedDeployOption?.status === 'available';
  const canContinueProvider = discovery.isSuccess && !!selectedFlow && providerReady && deployOptions.some(option => option.status === 'available');
  const canPreflight = slugOk && canContinueProvider && !!deployProvider && deployReady;

  const reset = () => {
    setStep(0);
    const defaultFlow = discovery.data?.flows.find(flow => flow.cloud_provider === discovery.data?.default_cloud_provider) ?? discovery.data?.flows[0];
    setProvider(defaultFlow?.cloud_provider ?? DEFAULT_CLOUD_PROVIDER);
    setDeployProvider(defaultFlow ? preferredDeployProvider(defaultFlow) : DEFAULT_DEPLOY_PROVIDER);
    setKubeContext('');
    setSelectedImportKey('');
    setCandidateQuery('');
    setIssued(null);
    setClusterId('');
    setName('');
    setCloseGuard(false);
    preflight.reset();
    register.reset();
    onClose();
  };

  const guardedClose = () => {
    if (step === 3 && issued && !connected && !closeGuard) {
      setCloseGuard(true);
      return;
    }
    reset();
  };

  const chooseProvider = (flow: RegistrationFlow) => {
    setProvider(flow.cloud_provider);
    setDeployProvider(preferredDeployProvider(flow));
    setSelectedImportKey('');
    setCandidateQuery('');
    setKubeContext('');
    preflight.reset();
  };

  const clearImport = () => {
    setSelectedImportKey('');
    setKubeContext('');
    preflight.reset();
  };

  const chooseImport = (key: string) => {
    setSelectedImportKey(key);
    const candidate = selectedFlow?.import_candidates.find(item => candidateKey(item) === key);
    if (!candidate) return;
    setClusterId(candidate.cluster_id);
    setName(candidate.name);
    setDeployProvider(candidate.deploy_provider || (selectedFlow ? preferredDeployProvider(selectedFlow) : DEFAULT_DEPLOY_PROVIDER));
    setKubeContext(candidate.kube_context ?? '');
    preflight.reset();
  };

  const runPreflight = () => {
    preflight.mutate(undefined, { onSuccess: () => setStep(2) });
  };

  useEffect(() => {
    if (!open || !selectedFlow || deployOptions.length === 0) return;
    if (!deployOptions.some(option => option.key === deployProvider)) {
      setDeployProvider(preferredDeployProvider(selectedFlow));
    }
  }, [deployOptions, deployProvider, open, selectedFlow]);

  return (
    <Modal open={open} title="클러스터 등록" onClose={guardedClose} size="lg">
      <Stepper steps={STEPS} current={step} />
      {step === 0 && (
        <>
          {discovery.isPending && <Skeleton lines={4} />}
          {discovery.isError && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', margin: 0 }}>
                프로바이더 목록을 불러오지 못했습니다 — {(discovery.error as Error).message}
              </p>
              <Button size="sm" onClick={() => discovery.refetch()} loading={discovery.isFetching}>다시 시도</Button>
            </div>
          )}
          {discovery.isSuccess && flows.length === 0 && (
            <p style={{ color: 'var(--warn)', fontSize: 'var(--fs-sm)' }}>사용 가능한 등록 플로우가 없습니다 — 관리자에게 문의해주세요.</p>
          )}
          {discovery.isSuccess && flows.length > 0 && (
            <>
              <div role="listbox" aria-label="클러스터 프로바이더" className="split split--even" style={{ gap: 10 }}>
                {flows.map(flow => (
                  <button
                    key={flow.cloud_provider}
                    type="button"
                    role="option"
                    aria-selected={activeProvider === flow.cloud_provider}
                    className="card"
                    style={{ cursor: 'pointer', textAlign: 'left', borderColor: activeProvider === flow.cloud_provider ? 'var(--brand)' : 'var(--border)' }}
                    onClick={() => chooseProvider(flow)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                      <b>{flow.label}</b>
                      <Badge tone={registrationStatusTone(flow.status)}>{registrationStatusLabel(flow.status)}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      <span className="cluster-registration-chip">{flow.cloud_provider}</span>
                      <span className="cluster-registration-chip">{flow.import_candidates.length} 후보</span>
                      <span className="cluster-registration-chip">{flow.deploy_providers.filter(option => option.status === 'available').length} 설치 경로</span>
                    </div>
                  </button>
                ))}
              </div>
              {selectedFlow?.unavailable_reason && (
                <p style={{ color: 'var(--warn)', fontSize: 'var(--fs-sm)' }}>{selectedFlow.unavailable_reason}</p>
              )}
              <div className="cluster-registration-toolbar">
                <SearchInput value={candidateQuery} onChange={setCandidateQuery} placeholder="후보 검색" />
                <Button
                  size="sm"
                  variant={selectedImportKey ? 'secondary' : 'primary'}
                  onClick={clearImport}
                >
                  직접 입력
                </Button>
              </div>
              <div role="listbox" aria-label="가져올 클러스터" className="cluster-registration-list">
                {filteredImportCandidates.map(candidate => (
                  <ImportCandidateButton
                    key={candidateKey(candidate)}
                    candidate={candidate}
                    selected={candidateKey(candidate) === selectedImportKey}
                    onClick={() => chooseImport(candidateKey(candidate))}
                  />
                ))}
                {filteredImportCandidates.length === 0 && (
                  <div className="cluster-registration-empty">
                    {selectedFlow?.import_candidates.length ? '검색 결과 없음' : '가져올 후보 없음'}
                  </div>
                )}
              </div>
              {selectedCandidate && (
                <KeyValue pairs={[
                  ['source', selectedCandidate.source],
                  ['handle', selectedCandidate.external_handle ?? ''],
                  ['kube context', selectedCandidate.kube_context ?? ''],
                ]} />
              )}
            </>
          )}
          <Footer onNext={() => setStep(1)} nextDisabled={!canContinueProvider} />
        </>
      )}
      {step === 1 && selectedFlow && (
        <>
          <Field label="cluster_id (소문자 slug)" error={clusterId && !slugOk ? '소문자·숫자·하이픈만 가능합니다' : undefined}>
            <input className="input" value={clusterId} onChange={e => { setClusterId(e.target.value); preflight.reset(); }} placeholder="prod-seoul" data-testid="cluster-id" />
          </Field>
          <Field label="표시 이름">
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={clusterId} />
          </Field>
          <Field label="설치 방식">
            <div role="listbox" aria-label="설치 방식" className="cluster-registration-list cluster-registration-list--compact">
              {deployOptions.map(option => (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={option.key === deployProvider}
                  disabled={option.status !== 'available'}
                  className="cluster-registration-option"
                  data-selected={option.key === deployProvider}
                  onClick={() => { setDeployProvider(option.key); preflight.reset(); }}
                >
                  <span>
                    <b>{option.label}</b>
                    <code>{option.key}</code>
                  </span>
                  <Badge tone={registrationStatusTone(option.status)}>{registrationStatusLabel(option.status)}</Badge>
                </button>
              ))}
            </div>
          </Field>
          {selectedDeployOption?.unavailable_reason && (
            <p style={{ color: 'var(--warn)', fontSize: 'var(--fs-sm)' }}>{selectedDeployOption.unavailable_reason}</p>
          )}
          {directApply && (
            <Field label="kube context">
              <select className="input" value={kubeContext} onChange={e => { setKubeContext(e.target.value); preflight.reset(); }}>
                <option value="">api-gateway 현재 context</option>
                {selectedFlow.import_candidates.filter(candidate => candidate.kube_context).map(candidate => (
                  <option key={candidateKey(candidate)} value={candidate.kube_context ?? ''}>{candidate.kube_context}</option>
                ))}
              </select>
            </Field>
          )}
          <KeyValue pairs={[
            ['프로바이더', activeProvider],
            ['설치 방식', deployProvider],
            ['환경', 'sandbox'],
            ['관측 스택', 'prometheus/loki/tempo target service'],
          ]} />
          <Footer onPrev={() => setStep(0)} onNext={runPreflight}
            nextDisabled={!canPreflight} nextLabel="사전 점검" loading={preflight.isPending} />
          {preflight.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              사전 점검 실패 — {(preflight.error as Error).message}. 입력을 확인한 뒤 다시 시도해주세요.
            </p>
          )}
        </>
      )}
      {step === 2 && (
        <>
          {preflight.isPending && <Skeleton lines={3} />}
          {preflight.data && (
            <>
              <Badge tone={preflight.data.valid ? 'ok' : 'danger'}>
                {preflight.data.valid ? '등록 가능' : '등록 전 수정 필요'}
              </Badge>
              <div className="cluster-registration-checks" style={{ marginTop: 12 }}>
                <PreflightCheck label="cluster_id" value={clusterId} tone={preflight.data.duplicate_cluster_id ? 'danger' : 'ok'} />
                <PreflightCheck label="프로바이더" value={`${activeProvider} + ${deployProvider}`} tone={preflight.data.provider_ready ? 'ok' : 'danger'} />
                <PreflightCheck label="에이전트" value={preflight.data.agent_install_status} tone={preflight.data.agent_install_status === 'not_registered' ? 'neutral' : registrationStatusTone(preflight.data.agent_install_status)} />
                <PreflightCheck label="중복" value={preflight.data.duplicate_cluster_id ? '있음' : '없음'} tone={preflight.data.duplicate_cluster_id ? 'danger' : 'ok'} />
                {preflight.data.kube_context_allowed !== null && preflight.data.kube_context_allowed !== undefined && (
                  <PreflightCheck label="kube context" value={preflight.data.kube_context_allowed ? '허용' : '차단'} tone={preflight.data.kube_context_allowed ? 'ok' : 'danger'} />
                )}
              </div>
              {preflight.data.errors.map(error => <p key={error} style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{error}</p>)}
              {preflight.data.warnings.map(warning => <p key={warning} style={{ color: 'var(--warn)', fontSize: 'var(--fs-sm)' }}>{warning}</p>)}
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <Button onClick={() => setStep(1)}>이전</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={runPreflight} loading={preflight.isPending}>다시 점검</Button>
              <Button variant="primary" disabled={!preflight.data?.valid} loading={register.isPending}
                onClick={() => register.mutate()}>등록 실행</Button>
            </div>
          </div>
          {register.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              등록 실패 — {(register.error as Error).message}. 내용을 수정한 뒤 다시 &lsquo;등록 실행&rsquo;을 눌러주세요.
            </p>
          )}
        </>
      )}
      {step === 3 && issued && (
        <>
          <Badge tone="ok">등록 완료</Badge>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)' }}>agent token 은 지금 한 번만 표시됩니다. 저장소·상태에 보관하지 않습니다.</p>
          <Field label="agent token">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" readOnly value={issued.agent_token} style={{ fontFamily: 'var(--font-mono)' }} data-testid="agent-token" />
              <Button onClick={() => copyToClipboard(issued.agent_token, 'agent token 복사됨')}>복사</Button>
            </div>
          </Field>
          {issued.install_command && (
            <Field label="원라인 설치 — 대상 클러스터에서 한 줄로 설치">
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" readOnly value={issued.install_command} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }} data-testid="install-command" />
                <Button onClick={() => copyToClipboard(issued.install_command!, '설치 명령 복사됨')}>복사</Button>
              </div>
            </Field>
          )}
          <Field label={issued.install_command ? 'install manifest (수동 적용 대안)' : 'install manifest — kubectl apply -f 로 적용'}>
            <CodeBlock code={issued.install_manifest} />
          </Field>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {connected
              ? <Badge tone="ok">{connQ.data?.connection_status ?? 'online'} — 에이전트 연결 완료</Badge>
              : <Badge tone="warn">미연결 — 연결 대기 중 ({connQ.data?.connection_status ?? '확인 중'})</Badge>}
            {!connected && <Button onClick={() => connQ.refetch()} loading={connQ.isFetching}>지금 확인</Button>}
            <span style={{ marginLeft: 'auto' }}><Button variant="primary" onClick={reset}>완료</Button></span>
          </div>
          {closeGuard && !connected && (
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginTop: 8 }} role="alert">
              에이전트가 아직 연결되지 않았습니다. 이 창을 닫으면 agent token 은 다시 볼 수 없습니다 —
              토큰/설치 명령을 복사했는지 확인한 뒤 <b>완료</b> 또는 한 번 더 닫기(ESC)를 눌러주세요.
            </p>
          )}
          {!connected && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 8 }}>
              대상 클러스터 적용 후 연결 상태가 자동 갱신됩니다.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function Footer({ onPrev, onNext, nextLabel = '다음', nextDisabled, loading }:
  { onPrev?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; loading?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
      {onPrev ? <Button onClick={onPrev}>이전</Button> : <span />}
      <Button variant="primary" onClick={onNext} disabled={nextDisabled} loading={loading} data-testid="wizard-next">{nextLabel}</Button>
    </div>
  );
}

function candidateKey(candidate: ImportCandidate): string {
  return `${candidate.cloud_provider}:${candidate.source}:${candidate.cluster_id}:${candidate.kube_context ?? candidate.external_handle ?? ''}`;
}

function isAgentOnline(status: string | undefined): boolean {
  return !!status && ONLINE_STATUSES.has(status);
}

function ImportCandidateButton({ candidate, selected, onClick }: { candidate: ImportCandidate; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className="cluster-registration-candidate"
      data-selected={selected}
      onClick={onClick}
    >
      <span className="cluster-registration-candidate__main">
        <b>{candidate.name}</b>
        <code>{candidate.cluster_id}</code>
      </span>
      <span className="cluster-registration-candidate__meta">
        <span>{candidate.source}</span>
        {candidate.kube_context && <span>{candidate.kube_context}</span>}
        {candidate.external_handle && <span>{candidate.external_handle}</span>}
      </span>
      <span className="cluster-registration-candidate__tags">
        <span className="cluster-registration-chip">{candidate.deploy_provider}</span>
        {candidate.direct_apply_available && <span className="cluster-registration-chip">직접 적용</span>}
        {Object.entries(candidate.labels).slice(0, 4).map(([key, value]) => (
          <span className="cluster-registration-chip" key={key}>{key}:{String(value)}</span>
        ))}
      </span>
    </button>
  );
}

function PreflightCheck({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  return (
    <div className="cluster-registration-check">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <Badge tone={tone}>{tone === 'ok' ? '정상' : tone === 'danger' ? '차단' : tone === 'warn' ? '주의' : '확인'}</Badge>
    </div>
  );
}

export function clusterImportCandidateMatches(candidate: ImportCandidate, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    candidate.cluster_id,
    candidate.name,
    candidate.source,
    candidate.cloud_provider,
    candidate.deploy_provider,
    candidate.kube_context ?? '',
    candidate.external_handle ?? '',
    candidate.console_url ?? '',
    ...Object.entries(candidate.labels).flatMap(([key, value]) => [key, String(value)]),
  ].join(' ').toLowerCase();
  return normalized.split(/\s+/).every(token => haystack.includes(token));
}

export function registrationStatusTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (['available', 'connected', 'online'].includes(status)) return 'ok';
  if (['unavailable', 'failed', 'blocked'].includes(status)) return 'danger';
  if (['stale', 'warning', 'degraded'].includes(status)) return 'warn';
  return 'neutral';
}

function registrationStatusLabel(status: string): string {
  if (status === 'available') return '사용 가능';
  if (status === 'unavailable') return '사용 불가';
  if (status === 'connected' || status === 'online') return '연결됨';
  if (status === 'stale') return '스테일';
  return status;
}

export function preferredDeployProvider(flow: Pick<RegistrationFlow, 'default_deploy_provider' | 'deploy_providers'>): string {
  return flow.deploy_providers.find(option => option.key === flow.default_deploy_provider && option.status === 'available')?.key
    ?? flow.deploy_providers.find(option => option.status === 'available')?.key
    ?? flow.default_deploy_provider
    ?? DEFAULT_DEPLOY_PROVIDER;
}
