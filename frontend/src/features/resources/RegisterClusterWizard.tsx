import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  Collapsible,
  ConfirmDialog,
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
import { fmtAbs } from '@/shared/lib/format';

const DEFAULT_DEPLOY_PROVIDER = 'manual-manifest';
const CLUSTER_REGISTRATION_TIMEOUT_MS = 15_000;
const CONNECTION_POLL_INTERVAL_MS = 5_000;
const CLUSTER_ID_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const CONNECTED_STATUSES = new Set(['connected', 'online']);
const EXPIRED_STATUSES = new Set(['expired', 'install_expired', 'token_expired', 'connect_expired']);
const ERROR_STATUSES = new Set(['error', 'failed', 'disconnected']);

type ProviderKind = 'eks' | 'gke' | 'aks' | 'existing-k8s' | 'kind' | 'minikube';
type LocationType = 'region' | 'zone';

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

type BootstrapStep = {
  label: string;
  command: string;
};

type TargetInstallResponse = {
  registered: boolean;
  cluster_id: string;
  status: string;
  applied: boolean;
  apply_output?: string | null;
  install_manifest: string;
  agent_token: string;
  install_command: string;
  bootstrap_command?: string;
  bootstrap_steps?: BootstrapStep[];
  connect_expires_at?: string | null;
  connect_timeout_seconds?: number | null;
};

type ConnectionStatusResponse = {
  connection_status?: string | null;
  status?: string | null;
  detail?: string | null;
  reason?: string | null;
  connect_expires_at?: string | null;
  connect_timeout_seconds?: number | null;
};

type FormState = {
  cluster_id: string;
  name: string;
  environment: string;
  management_base_url: string;
  region: string;
  eks_cluster_name: string;
  project_id: string;
  location_type: LocationType;
  location: string;
  gke_cluster_name: string;
  resource_group: string;
  aks_cluster_name: string;
  context_alias: string;
  context_name: string;
  kind_cluster_name: string;
  minikube_profile: string;
};

type Validation = {
  valid: boolean;
  errors: Partial<Record<keyof FormState | 'provider', string>>;
};

type TargetPayload = {
  cluster_id: string;
  name: string;
  environment: string;
  apply: false;
  cloud_provider: ProviderKind;
  deploy_provider: typeof DEFAULT_DEPLOY_PROVIDER;
  provider_config: Record<string, string>;
  management_base_url?: string;
  kube_context?: string;
};

type TargetPreflightPayload = Omit<TargetPayload, 'name' | 'environment'>;

const providerOptions: Array<{
  key: ProviderKind | 'local';
  label: string;
  description: string;
  badge: string;
}> = [
  {
    key: 'eks',
    label: 'EKS',
    description: 'AWS kubeconfig 갱신 후 target agent 설치',
    badge: 'AWS',
  },
  {
    key: 'gke',
    label: 'GKE',
    description: 'gcloud credential 로드 후 target agent 설치',
    badge: 'GCP',
  },
  {
    key: 'aks',
    label: 'AKS',
    description: 'Azure credential 로드 후 target agent 설치',
    badge: 'Azure',
  },
  {
    key: 'existing-k8s',
    label: 'Existing Kubernetes',
    description: '이미 있는 kubeconfig context에 설치',
    badge: 'kubectl',
  },
  {
    key: 'local',
    label: 'kind/minikube',
    description: '로컬 개발 클러스터 context에 설치',
    badge: 'local',
  },
];

const initialForm: FormState = {
  cluster_id: '',
  name: '',
  environment: 'dev',
  management_base_url: '',
  region: '',
  eks_cluster_name: '',
  project_id: '',
  location_type: 'region',
  location: '',
  gke_cluster_name: '',
  resource_group: '',
  aks_cluster_name: '',
  context_alias: '',
  context_name: '',
  kind_cluster_name: '',
  minikube_profile: 'minikube',
};

export function RegisterClusterWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [provider, setProvider] = useState<ProviderKind | 'local'>('eks');
  const [localProvider, setLocalProvider] = useState<'kind' | 'minikube'>('kind');
  const [form, setForm] = useState<FormState>(initialForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [issued, setIssued] = useState<TargetInstallResponse | null>(null);
  const [closeGuard, setCloseGuard] = useState(false);
  const [copyTokenState, setCopyTokenState] = useState<'idle' | 'failed'>('idle');

  const discovery = useQuery({
    queryKey: ['providers', 'cluster-discovery'],
    queryFn: () => get<DiscoveryResponse>('/providers/cluster-discovery', { timeoutMs: CLUSTER_REGISTRATION_TIMEOUT_MS }),
    enabled: open,
    retry: false,
  });

  const activeCloudProvider = provider === 'local' ? localProvider : provider;
  const selectedFlow = useMemo(
    () => findFlow(discovery.data?.flows ?? [], activeCloudProvider),
    [activeCloudProvider, discovery.data?.flows],
  );
  const validation = useMemo(
    () => validateForm(form, activeCloudProvider),
    [activeCloudProvider, form],
  );
  const installSteps = useMemo(() => installStepBlocks(issued), [issued]);
  const prerequisites = providerPrerequisites(activeCloudProvider);
  const localInstall = activeCloudProvider === 'kind' || activeCloudProvider === 'minikube';

  const preflight = useMutation({
    mutationFn: () => post<TargetPreflight>('/targets/preflight', targetPreflightPayload(form, activeCloudProvider), {
      timeoutMs: CLUSTER_REGISTRATION_TIMEOUT_MS,
    }),
    onSuccess: (data) => {
      if (!data.valid) {
        toast.push({
          tone: 'danger',
          title: '사전 검증 실패',
          description: firstMessage(data.errors) ?? '입력값을 확인해주세요',
        });
        return;
      }
      register.mutate();
    },
    onError: (error) => {
      toast.push({
        tone: 'danger',
        title: '사전 검증 실패',
        description: errorMessage(error),
      });
    },
  });

  const register = useMutation({
    mutationFn: () => post<TargetInstallResponse>('/targets', targetPayload(form, activeCloudProvider), {
      timeoutMs: CLUSTER_REGISTRATION_TIMEOUT_MS,
    }),
    onSuccess: (data) => {
      setIssued(data);
      toast.push({
        tone: 'success',
        title: '클러스터 등록 완료',
        description: '설치 명령을 복사해 대상 클러스터에서 실행하세요',
      });
      void queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
    onError: (error) => {
      toast.push({
        tone: 'danger',
        title: '등록 실패',
        description: errorMessage(error),
      });
    },
  });

  const connQ = useQuery({
    queryKey: ['cluster-conn', issued?.cluster_id ?? form.cluster_id],
    queryFn: () => get<ConnectionStatusResponse>(`/clusters/${issued?.cluster_id ?? form.cluster_id}/connection-status`, {
      timeoutMs: CLUSTER_REGISTRATION_TIMEOUT_MS,
    }),
    enabled: open && !!issued,
    refetchInterval: (query) => {
      const state = connectionState(query.state.data, issued);
      return state.kind === 'connected' || state.kind === 'expired' || state.kind === 'error'
        ? false
        : CONNECTION_POLL_INTERVAL_MS;
    },
    retry: false,
  });
  const connectionStatus = connectionState(connQ.data, issued);
  const connected = connectionStatus.kind === 'connected';
  const canConfirm = validation.valid && !preflight.isPending && !register.isPending && !issued;

  useEffect(() => {
    if (!open) return;
    const defaultProvider = preferredCloudProvider(discovery.data);
    if (defaultProvider) {
      if (defaultProvider === 'kind' || defaultProvider === 'minikube') {
        setProvider('local');
        setLocalProvider(defaultProvider);
      } else {
        setProvider(defaultProvider);
      }
    }
  }, [discovery.data, open]);

  const resetForClose = () => {
    setProvider('eks');
    setLocalProvider('kind');
    setForm(initialForm);
    setAdvancedOpen(false);
    setIssued(null);
    setCloseGuard(false);
    setCopyTokenState('idle');
    preflight.reset();
    register.reset();
    onClose();
  };

  const requestClose = () => {
    if (issued && !connected) {
      setCloseGuard(true);
      return;
    }
    resetForClose();
  };

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => applyFieldChange(prev, key, value, activeCloudProvider));
    preflight.reset();
    register.reset();
    setIssued(null);
    setCopyTokenState('idle');
  };

  const chooseProvider = (nextProvider: ProviderKind | 'local') => {
    setProvider(nextProvider);
    const nextCloudProvider = nextProvider === 'local' ? localProvider : nextProvider;
    setForm((prev) => applyProviderDefaults(prev, nextCloudProvider));
    preflight.reset();
    register.reset();
    setIssued(null);
  };

  const chooseLocalProvider = (nextProvider: 'kind' | 'minikube') => {
    setLocalProvider(nextProvider);
    setForm((prev) => applyProviderDefaults(prev, nextProvider));
    preflight.reset();
    register.reset();
    setIssued(null);
  };

  const runConfirm = () => {
    if (!validation.valid) return;
    preflight.mutate();
  };

  const reissue = () => {
    if (!validation.valid) return;
    register.mutate();
  };

  const copyToken = async () => {
    if (!issued?.agent_token) return;
    try {
      await navigator.clipboard.writeText(issued.agent_token);
      setCopyTokenState('idle');
      toast.push({ tone: 'success', title: '복사 완료', description: 'agent token을 클립보드에 복사했습니다' });
    } catch {
      setCopyTokenState('failed');
      toast.push({ tone: 'danger', title: '복사 실패', description: '토큰 값을 직접 선택해 복사해주세요' });
    }
  };

  return (
    <>
      <Modal
        open={open}
        title="클러스터 등록"
        description="provider를 선택하고 사전 검증을 통과하면 설치 명령이 발급됩니다"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
      >
        <div className="grid gap-5">
          <StepRail issued={Boolean(issued)} connected={connected} verifying={preflight.isPending || register.isPending} />

          {!issued ? (
            <>
              <ProviderSection
                provider={provider}
                localProvider={localProvider}
                activeCloudProvider={activeCloudProvider}
                discovery={discovery}
                selectedFlow={selectedFlow}
                onProviderChange={chooseProvider}
                onLocalProviderChange={chooseLocalProvider}
              />

              <Card title="등록 정보" description="cluster_id는 내부 식별자이며 설치 context 기본값으로 사용됩니다">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="cluster_id" error={validation.errors.cluster_id} help="소문자, 숫자, 하이픈만 입력">
                    <Input
                      value={form.cluster_id}
                      onChange={(event) => setField('cluster_id', event.target.value)}
                      placeholder="prod-seoul-01"
                      data-testid="cluster-id"
                    />
                  </Field>
                  <Field label="표시 이름" error={validation.errors.name}>
                    <Input
                      value={form.name}
                      onChange={(event) => setField('name', event.target.value)}
                      placeholder={form.cluster_id || '운영 클러스터'}
                    />
                  </Field>
                  <Field
                    label="운영 구분"
                    error={validation.errors.environment}
                    help={localInstall ? '로컬 클러스터는 dev로 기록됩니다' : '목록과 배포 필터에 쓰는 환경 라벨입니다'}
                  >
                    <Select
                      value={form.environment}
                      onChange={(event) => setField('environment', event.target.value)}
                      disabled={localInstall}
                    >
                      <option value="dev">dev</option>
                      <option value="stage">stage</option>
                      <option value="prod">prod</option>
                    </Select>
                  </Field>
                  <Field label="설치 방식" help="수동 manifest 설치 흐름으로 고정됩니다">
                    <Input value="수동 manifest" readOnly />
                  </Field>
                </div>
              </Card>

              <ProviderFields
                provider={activeCloudProvider}
                form={form}
                errors={validation.errors}
                onFieldChange={setField}
              />

              <Card
                title="사전 요구사항"
                description="터미널에서 설치 명령을 실행하기 전에 준비되어야 합니다"
              >
                <ul className="grid gap-2 text-body text-secondary">
                  {prerequisites.map((item) => (
                    <li key={item} className="flex min-w-0 items-start gap-2">
                      <CheckIcon className="mt-0.5 text-success" />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <div>
                <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((value) => !value)}>
                  고급 설정
                </Button>
                <Collapsible open={advancedOpen}>
                  <div className="mt-3">
                    <Field label="management_base_url" help="비워두면 서버 기본 공개 URL을 사용합니다">
                      <Input
                        value={form.management_base_url}
                        onChange={(event) => setField('management_base_url', event.target.value)}
                        placeholder="https://k8s.example.com"
                      />
                    </Field>
                  </div>
                </Collapsible>
              </div>

              <ValidationPanel preflight={preflight.data} pending={preflight.isPending || register.isPending} error={preflight.error ?? register.error} />

              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-muted">
                  필수값이 유효하고 서버 preflight가 통과해야 등록이 실행됩니다
                </p>
                <Button
                  variant="primary"
                  disabled={!canConfirm}
                  loading={preflight.isPending || register.isPending}
                  onClick={runConfirm}
                  data-testid="cluster-register-confirm"
                >
                  확인
                </Button>
              </div>
            </>
          ) : (
            <>
              <Card
                title="설치 명령"
                description="대상 클러스터에 접근 가능한 터미널에서 실행하세요"
              >
                <div className="grid gap-4">
                  <div className="rounded-control border border-warning bg-bg px-3 py-2 text-caption font-semibold text-warning">
                    이 명령은 agent 자격증명을 포함합니다. 한 번만 안전하게 보관하세요.
                  </div>
                  <div className="grid gap-3 rounded-panel border border-border bg-bg p-4 text-body text-secondary">
                    <p>클러스터에서 아웃바운드 HTTPS만 가능하면 management API와 연결할 수 있습니다.</p>
                    {issued.connect_expires_at && (
                      <p className="text-caption text-muted">연결 대기 만료: {fmtAbs(issued.connect_expires_at)} · {remainingLabel(issued.connect_expires_at)}</p>
                    )}
                  </div>
                  {installSteps.length > 0 ? (
                    <div className="grid gap-3">
                      {installSteps.map((step, index) => (
                        <CodeBlock key={`${step.label}-${index}`} label={step.label} code={step.command} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="설치 명령 없음"
                      description="서버가 설치 명령을 아직 반환하지 않았습니다. manifest를 수동으로 저장해 kubectl apply -f로 적용하세요"
                      action={<CodeBlock label="install manifest" code={issued.install_manifest} />}
                    />
                  )}
                  <Field label="agent token" help={copyTokenState === 'failed' ? '복사 권한이 없으면 값을 직접 선택해 복사하세요' : '토큰 원문은 현재 화면에서만 확인할 수 있습니다'}>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <Input value={issued.agent_token} readOnly className="font-mono text-caption" data-testid="agent-token" />
                      <Button onClick={copyToken}>토큰 복사</Button>
                    </div>
                  </Field>
                </div>
              </Card>

              <Card
                title="연결 대기"
                description="명령 실행 후 보통 30초~1분 내 연결됩니다"
                error={connQ.isError ? connQ.error : null}
                onRetry={() => void connQ.refetch()}
              >
                <div className="grid gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Badge tone={connectionStatus.tone}>{connectionStatus.label}</Badge>
                    <Button size="sm" onClick={() => void connQ.refetch()} loading={connQ.isFetching}>
                      지금 확인
                    </Button>
                  </div>
                  <KeyValueList
                    items={[
                      { label: 'cluster_id', value: issued.cluster_id },
                      { label: '상태', value: connectionStatus.raw },
                      { label: '설치 만료', value: issued.connect_expires_at ? `${fmtAbs(issued.connect_expires_at)} · ${remainingLabel(issued.connect_expires_at)}` : '서버 기본 정책' },
                    ]}
                  />
                  {connectionStatus.kind === 'pending' && (
                    <p className="text-body text-secondary">터미널에서 명령을 실행하면 5초 간격으로 연결 상태를 확인합니다.</p>
                  )}
                  {(connectionStatus.kind === 'expired' || connectionStatus.kind === 'error') && (
                    <div className="grid gap-3 rounded-panel border border-border bg-bg p-4">
                      <p className="text-body text-secondary">
                        설치 토큰이 만료되었거나 연결 확인 중 오류가 발생했습니다. 새 명령을 재발급하거나 목록에서 등록 항목을 정리한 뒤 다시 등록하세요.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="primary" loading={preflight.isPending || register.isPending} onClick={reissue} disabled={!validation.valid}>
                          재발급
                        </Button>
                        <Button variant="secondary" onClick={resetForClose}>
                          목록으로 이동
                        </Button>
                      </div>
                    </div>
                  )}
                  {connected && (
                    <EmptyState
                      title="클러스터 연결 완료"
                      description="이제 evidence 정책과 인벤토리 수집 상태를 확인할 수 있습니다"
                      action={<Button variant="primary" onClick={resetForClose}>evidence 정책 보기</Button>}
                    />
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={closeGuard}
        title="설치 흐름 닫기"
        description="아직 연결되지 않았습니다. agent token은 다시 볼 수 없으므로 설치 명령을 복사했는지 확인해주세요."
        confirmLabel="닫기"
        cancelLabel="계속 보기"
        onConfirm={resetForClose}
        onOpenChange={setCloseGuard}
      />
    </>
  );
}

function ProviderSection({
  provider,
  localProvider,
  activeCloudProvider,
  discovery,
  selectedFlow,
  onProviderChange,
  onLocalProviderChange,
}: {
  provider: ProviderKind | 'local';
  localProvider: 'kind' | 'minikube';
  activeCloudProvider: ProviderKind;
  discovery: ReturnType<typeof useQuery<DiscoveryResponse>>;
  selectedFlow?: RegistrationFlow;
  onProviderChange: (provider: ProviderKind | 'local') => void;
  onLocalProviderChange: (provider: 'kind' | 'minikube') => void;
}) {
  return (
    <Card
      title="Provider"
      description="설치 명령을 생성할 클러스터 provider를 선택합니다"
      loading={discovery.isPending}
      error={discovery.isError ? discovery.error : null}
      onRetry={() => void discovery.refetch()}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {providerOptions.map((option) => {
          const selected = provider === option.key;
          const flow = option.key === 'local'
            ? findFlow(discovery.data?.flows ?? [], localProvider)
            : findFlow(discovery.data?.flows ?? [], option.key);
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={selected}
              className={cx(
                'grid min-h-28 gap-3 rounded-panel border bg-surface p-4 text-left transition-colors',
                selected ? 'border-accent shadow-soft' : 'border-border hover:border-border-strong hover:bg-raised',
              )}
              onClick={() => onProviderChange(option.key)}
            >
              <span className="flex min-w-0 items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-title font-semibold text-primary">{option.label}</span>
                  <span className="mt-1 block text-body text-secondary">{option.description}</span>
                </span>
                <Badge tone={flow ? toneForStatus(flow.status) : 'neutral'}>{flow ? registrationStatusLabel(flow.status) : option.badge}</Badge>
              </span>
              {flow?.unavailable_reason && <span className="text-caption text-warning">{flow.unavailable_reason}</span>}
            </button>
          );
        })}
      </div>

      {provider === 'local' && (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-panel border border-border bg-bg p-1">
          {(['kind', 'minikube'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={localProvider === value}
              className={cx(
                'h-9 rounded-control px-3 text-body font-semibold transition-colors',
                localProvider === value ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-raised hover:text-primary',
              )}
              onClick={() => onLocalProviderChange(value)}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        <KeyValueList
          items={[
            { label: '선택 provider', value: activeCloudProvider },
            { label: '서버 discovery', value: selectedFlow ? registrationStatusLabel(selectedFlow.status) : 'preflight에서 확인' },
            { label: '설치 방식', value: '수동 manifest' },
          ]}
        />
      </div>
    </Card>
  );
}

function ProviderFields({
  provider,
  form,
  errors,
  onFieldChange,
}: {
  provider: ProviderKind;
  form: FormState;
  errors: Validation['errors'];
  onFieldChange: (key: keyof FormState, value: string) => void;
}) {
  if (provider === 'eks') {
    return (
      <Card title="EKS 설정" description="aws CLI가 생성한 kubeconfig context에 agent를 설치합니다">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="region" error={errors.region}>
            <Input value={form.region} onChange={(event) => onFieldChange('region', event.target.value)} placeholder="ap-northeast-2" />
          </Field>
          <Field label="eks_cluster_name" error={errors.eks_cluster_name}>
            <Input value={form.eks_cluster_name} onChange={(event) => onFieldChange('eks_cluster_name', event.target.value)} placeholder="production-eks" />
          </Field>
          <Field label="context_alias" error={errors.context_alias} help="기본값은 cluster_id입니다">
            <Input value={form.context_alias} onChange={(event) => onFieldChange('context_alias', event.target.value)} placeholder={form.cluster_id || 'prod-seoul-01'} />
          </Field>
        </div>
      </Card>
    );
  }

  if (provider === 'gke') {
    return (
      <Card title="GKE 설정" description="gcloud get-credentials 후 target agent를 설치합니다">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="project_id" error={errors.project_id}>
            <Input value={form.project_id} onChange={(event) => onFieldChange('project_id', event.target.value)} placeholder="platform-prod" />
          </Field>
          <Field label="location_type">
            <Select value={form.location_type} onChange={(event) => onFieldChange('location_type', event.target.value)}>
              <option value="region">region</option>
              <option value="zone">zone</option>
            </Select>
          </Field>
          <Field label="location" error={errors.location}>
            <Input value={form.location} onChange={(event) => onFieldChange('location', event.target.value)} placeholder="asia-northeast3" />
          </Field>
          <Field label="gke_cluster_name" error={errors.gke_cluster_name}>
            <Input value={form.gke_cluster_name} onChange={(event) => onFieldChange('gke_cluster_name', event.target.value)} placeholder="production-gke" />
          </Field>
          <Field label="context_alias" error={errors.context_alias} help="기본값은 cluster_id입니다">
            <Input value={form.context_alias} onChange={(event) => onFieldChange('context_alias', event.target.value)} placeholder={form.cluster_id || 'prod-seoul-01'} />
          </Field>
        </div>
      </Card>
    );
  }

  if (provider === 'aks') {
    return (
      <Card title="AKS 설정" description="az CLI credential 로드 후 target agent를 설치합니다">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="resource_group" error={errors.resource_group}>
            <Input value={form.resource_group} onChange={(event) => onFieldChange('resource_group', event.target.value)} placeholder="rg-platform-prod" />
          </Field>
          <Field label="aks_cluster_name" error={errors.aks_cluster_name}>
            <Input value={form.aks_cluster_name} onChange={(event) => onFieldChange('aks_cluster_name', event.target.value)} placeholder="production-aks" />
          </Field>
          <Field label="context_alias" error={errors.context_alias} help="기본값은 cluster_id입니다">
            <Input value={form.context_alias} onChange={(event) => onFieldChange('context_alias', event.target.value)} placeholder={form.cluster_id || 'prod-seoul-01'} />
          </Field>
        </div>
      </Card>
    );
  }

  if (provider === 'kind') {
    return (
      <Card title="kind 설정" description="kind context에 target agent를 설치합니다">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="kind_cluster_name" error={errors.kind_cluster_name}>
            <Input value={form.kind_cluster_name} onChange={(event) => onFieldChange('kind_cluster_name', event.target.value)} placeholder={form.cluster_id || 'jungle-dev'} />
          </Field>
          <Field label="context" help="kind-<name> 형식으로 사용됩니다">
            <Input value={kindContext(form)} readOnly />
          </Field>
        </div>
      </Card>
    );
  }

  if (provider === 'minikube') {
    return (
      <Card title="minikube 설정" description="minikube profile context에 target agent를 설치합니다">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="profile" error={errors.minikube_profile}>
            <Input value={form.minikube_profile} onChange={(event) => onFieldChange('minikube_profile', event.target.value)} placeholder="minikube" />
          </Field>
          <Field label="context" help="profile 이름을 context로 사용합니다">
            <Input value={form.minikube_profile || 'minikube'} readOnly />
          </Field>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Existing Kubernetes 설정" description="이미 준비된 kubeconfig context에 target agent를 설치합니다">
      <Field label="context_name" error={errors.context_name}>
        <Input value={form.context_name} onChange={(event) => onFieldChange('context_name', event.target.value)} placeholder="arn:aws:eks:ap-northeast-2:123456789012:cluster/prod" />
      </Field>
    </Card>
  );
}

function ValidationPanel({
  preflight,
  pending,
  error,
}: {
  preflight?: TargetPreflight;
  pending: boolean;
  error: unknown;
}) {
  if (pending) {
    return (
      <Card title="서버 검증" description="중복, provider 준비 상태, 설치 설정을 확인 중입니다">
        <Skeleton lines={3} />
      </Card>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="서버 검증 실패"
        description={errorMessage(error)}
      />
    );
  }

  if (!preflight) {
    return (
      <Card title="서버 검증" description="확인을 누르면 등록 전에 서버 검증을 먼저 실행합니다">
        <p className="text-body text-secondary">중복 cluster_id, provider 지원 여부, management URL 설정을 검증합니다.</p>
      </Card>
    );
  }

  return (
    <Card title="서버 검증 결과" description={preflight.valid ? '등록 가능한 상태입니다' : '아래 항목을 수정해야 합니다'}>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          {preflightItems(preflight).map((item) => (
            <div key={item.label} className="grid gap-2 rounded-panel border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-label font-semibold text-muted">{item.label}</span>
                <Badge tone={item.tone}>{item.badge}</Badge>
              </div>
              <span className="truncate text-body text-secondary">{item.value}</span>
            </div>
          ))}
        </div>
        {preflight.errors.length > 0 && (
          <div className="grid gap-2" role="alert">
            {preflight.errors.map((message) => (
              <p key={message} className="text-caption font-medium text-danger">{message}</p>
            ))}
          </div>
        )}
        {preflight.warnings.length > 0 && (
          <div className="grid gap-2">
            {preflight.warnings.map((message) => (
              <p key={message} className="text-caption font-medium text-warning">{message}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function StepRail({ issued, connected, verifying }: { issued: boolean; connected: boolean; verifying: boolean }) {
  const steps = [
    { label: '입력', active: !issued, done: issued },
    { label: '검증', active: verifying, done: issued },
    { label: '설치', active: issued && !connected, done: connected },
    { label: '연결', active: connected, done: connected },
  ];
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="등록 단계">
      {steps.map((step) => (
        <li key={step.label} className="min-w-0">
          <div className={cx(
            'h-2 rounded-control',
            step.done ? 'bg-success' : step.active ? 'bg-accent' : 'bg-raised',
          )} />
          <p className={cx('mt-2 truncate text-caption font-semibold', step.active || step.done ? 'text-primary' : 'text-muted')}>{step.label}</p>
        </li>
      ))}
    </ol>
  );
}

function targetPayload(form: FormState, provider: ProviderKind): TargetPayload {
  const provider_config = providerConfig(form, provider);
  const payload: TargetPayload = {
    cluster_id: form.cluster_id.trim(),
    name: form.name.trim() || form.cluster_id.trim(),
    environment: form.environment.trim() || 'dev',
    apply: false,
    cloud_provider: provider,
    deploy_provider: DEFAULT_DEPLOY_PROVIDER,
    provider_config,
  };
  const managementBaseUrl = form.management_base_url.trim();
  if (managementBaseUrl) payload.management_base_url = managementBaseUrl;
  if (provider === 'existing-k8s' && form.context_name.trim()) payload.kube_context = form.context_name.trim();
  return payload;
}

function targetPreflightPayload(form: FormState, provider: ProviderKind): TargetPreflightPayload {
  const payload = targetPayload(form, provider);
  return {
    cluster_id: payload.cluster_id,
    apply: payload.apply,
    cloud_provider: payload.cloud_provider,
    deploy_provider: payload.deploy_provider,
    provider_config: payload.provider_config,
    ...(payload.management_base_url ? { management_base_url: payload.management_base_url } : {}),
    ...(payload.kube_context ? { kube_context: payload.kube_context } : {}),
  };
}

function providerConfig(form: FormState, provider: ProviderKind): Record<string, string> {
  if (provider === 'eks') {
    return compactConfig({
      region: form.region,
      eks_cluster_name: form.eks_cluster_name,
      context_alias: contextAlias(form),
    });
  }
  if (provider === 'gke') {
    return compactConfig({
      project_id: form.project_id,
      location_type: form.location_type,
      location: form.location,
      gke_cluster_name: form.gke_cluster_name,
      context_alias: contextAlias(form),
    });
  }
  if (provider === 'aks') {
    return compactConfig({
      resource_group: form.resource_group,
      aks_cluster_name: form.aks_cluster_name,
      context_alias: contextAlias(form),
    });
  }
  if (provider === 'kind') {
    return compactConfig({
      local_provider: 'kind',
      kind_cluster_name: form.kind_cluster_name || form.cluster_id,
      context_alias: kindContext(form),
    });
  }
  if (provider === 'minikube') {
    return compactConfig({
      local_provider: 'minikube',
      profile: form.minikube_profile || 'minikube',
      context_alias: form.minikube_profile || 'minikube',
    });
  }
  return compactConfig({
    context_name: form.context_name,
  });
}

function validateForm(form: FormState, provider: ProviderKind): Validation {
  const errors: Validation['errors'] = {};
  const clusterId = form.cluster_id.trim();
  if (!clusterId) errors.cluster_id = 'cluster_id를 입력하세요';
  else if (!CLUSTER_ID_PATTERN.test(clusterId)) errors.cluster_id = '소문자, 숫자, 하이픈만 사용할 수 있습니다';
  if (!form.name.trim()) errors.name = '표시 이름을 입력하세요';
  if (!form.environment.trim()) errors.environment = '환경을 입력하세요';

  if (provider === 'eks') {
    requireShellField(errors, 'region', form.region, 'region을 입력하세요');
    requireShellField(errors, 'eks_cluster_name', form.eks_cluster_name, 'EKS 클러스터 이름을 입력하세요');
    requireShellField(errors, 'context_alias', contextAlias(form), 'context alias를 입력하세요');
  } else if (provider === 'gke') {
    requireShellField(errors, 'project_id', form.project_id, 'project_id를 입력하세요');
    requireShellField(errors, 'location', form.location, 'location을 입력하세요');
    requireShellField(errors, 'gke_cluster_name', form.gke_cluster_name, 'GKE 클러스터 이름을 입력하세요');
    requireShellField(errors, 'context_alias', contextAlias(form), 'context alias를 입력하세요');
  } else if (provider === 'aks') {
    requireShellField(errors, 'resource_group', form.resource_group, 'resource_group을 입력하세요');
    requireShellField(errors, 'aks_cluster_name', form.aks_cluster_name, 'AKS 클러스터 이름을 입력하세요');
    requireShellField(errors, 'context_alias', contextAlias(form), 'context alias를 입력하세요');
  } else if (provider === 'existing-k8s') {
    requireShellField(errors, 'context_name', form.context_name, 'kubeconfig context를 입력하세요');
  } else if (provider === 'kind') {
    requireShellField(errors, 'kind_cluster_name', form.kind_cluster_name || form.cluster_id, 'kind 클러스터 이름을 입력하세요');
  } else if (provider === 'minikube') {
    requireShellField(errors, 'minikube_profile', form.minikube_profile || 'minikube', 'profile을 입력하세요');
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function requireShellField(
  errors: Validation['errors'],
  key: keyof FormState,
  value: string,
  emptyMessage: string,
) {
  const trimmed = value.trim();
  if (!trimmed) {
    errors[key] = emptyMessage;
    return;
  }
  if (/\s/.test(trimmed)) {
    errors[key] = '공백 없이 입력하세요';
  }
}

function applyFieldChange(form: FormState, key: keyof FormState, value: string, provider: ProviderKind): FormState {
  const next = { ...form, [key]: value };
  if (key === 'cluster_id') {
    const normalized = value.trim().toLowerCase();
    if (!form.name || form.name === form.cluster_id) next.name = normalized;
    if (!form.context_alias || form.context_alias === contextAlias(form)) next.context_alias = normalized;
    if (!form.kind_cluster_name || form.kind_cluster_name === form.cluster_id) next.kind_cluster_name = normalized;
  }
  if (key === 'kind_cluster_name' && provider === 'kind') {
    next.context_alias = kindContext(next);
  }
  if (key === 'minikube_profile' && provider === 'minikube') {
    next.context_alias = value.trim() || 'minikube';
  }
  return next;
}

function applyProviderDefaults(form: FormState, provider: ProviderKind): FormState {
  const next = { ...form };
  if (!next.name && next.cluster_id) next.name = next.cluster_id;
  if (provider === 'kind') {
    next.environment = 'dev';
    if (!next.kind_cluster_name) next.kind_cluster_name = next.cluster_id;
    next.context_alias = kindContext(next);
  } else if (provider === 'minikube') {
    next.environment = 'dev';
    if (!next.minikube_profile) next.minikube_profile = 'minikube';
    next.context_alias = next.minikube_profile;
  } else if (provider === 'eks' || provider === 'gke' || provider === 'aks') {
    if (!next.context_alias) next.context_alias = next.cluster_id;
  }
  return next;
}

function contextAlias(form: FormState): string {
  return form.context_alias.trim() || form.cluster_id.trim();
}

function kindContext(form: FormState): string {
  const name = (form.kind_cluster_name || form.cluster_id).trim();
  if (!name) return '';
  return name.startsWith('kind-') ? name : `kind-${name}`;
}

function compactConfig(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
}

function findFlow(flows: RegistrationFlow[], provider: ProviderKind): RegistrationFlow | undefined {
  return flows.find((flow) => flow.cloud_provider === provider);
}

function preferredCloudProvider(discovery?: DiscoveryResponse): ProviderKind | null {
  const candidate = discovery?.default_cloud_provider;
  if (isProviderKind(candidate)) return candidate;
  const first = discovery?.flows.find((flow) => isProviderKind(flow.cloud_provider));
  return isProviderKind(first?.cloud_provider) ? first.cloud_provider : null;
}

function isProviderKind(value: string | undefined): value is ProviderKind {
  return value === 'eks'
    || value === 'gke'
    || value === 'aks'
    || value === 'existing-k8s'
    || value === 'kind'
    || value === 'minikube';
}

function providerPrerequisites(provider: ProviderKind): string[] {
  if (provider === 'eks') return ['aws CLI', 'kubectl', 'AWS credentials', 'EKS access 권한'];
  if (provider === 'gke') return ['gcloud', 'kubectl', 'GCP project/cluster 권한'];
  if (provider === 'aks') return ['az CLI', 'kubectl', 'AKS 권한'];
  return ['kubectl context 존재', '대상 클러스터 접근 권한'];
}

function installStepBlocks(issued: TargetInstallResponse | null): BootstrapStep[] {
  if (!issued) return [];
  const steps = issued.bootstrap_steps?.filter((step) => step.command.trim()) ?? [];
  if (steps.length > 0) return steps;
  const fallback = issued.bootstrap_command?.trim() || issued.install_command?.trim();
  if (fallback) return [{ label: 'bootstrap command', command: fallback }];
  if (issued.install_manifest?.trim()) return [{ label: 'install manifest', command: issued.install_manifest }];
  return [];
}

function connectionState(data: ConnectionStatusResponse | undefined, issued: TargetInstallResponse | null): {
  kind: 'pending' | 'connected' | 'expired' | 'error';
  raw: string;
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
} {
  const raw = (data?.connection_status ?? data?.status ?? issued?.status ?? 'pending').toLowerCase();
  if (CONNECTED_STATUSES.has(raw)) return { kind: 'connected', raw, label: 'connected — 에이전트 연결 완료', tone: 'success' };
  if (EXPIRED_STATUSES.has(raw)) return { kind: 'expired', raw, label: 'expired — 재발급 필요', tone: 'danger' };
  if (ERROR_STATUSES.has(raw)) return { kind: 'error', raw, label: 'error — 연결 확인 실패', tone: 'danger' };
  return { kind: 'pending', raw, label: `pending — 연결 대기 중 (${raw})`, tone: 'warning' };
}

function remainingLabel(value: string): string {
  const expiresAt = Date.parse(value);
  if (Number.isNaN(expiresAt)) return '만료 시각 확인 필요';
  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) return '만료됨';
  const minutes = Math.ceil(diffMs / 60_000);
  return `${minutes.toLocaleString()}분 남음`;
}

function preflightItems(preflight?: TargetPreflight): Array<{ label: string; value: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; badge: string }> {
  if (!preflight) return [];
  return [
    {
      label: 'cluster_id',
      value: preflight.duplicate_cluster_id ? '이미 등록됨' : '사용 가능',
      tone: preflight.duplicate_cluster_id ? 'danger' : 'success',
      badge: preflight.duplicate_cluster_id ? '중복' : '정상',
    },
    {
      label: 'provider',
      value: preflight.provider_ready ? '준비됨' : '사용 불가',
      tone: preflight.provider_ready ? 'success' : 'danger',
      badge: preflight.provider_ready ? '정상' : '차단',
    },
    {
      label: 'agent',
      value: preflight.agent_install_status,
      tone: toneForStatus(preflight.agent_install_status),
      badge: registrationStatusLabel(preflight.agent_install_status),
    },
    {
      label: 'connection',
      value: preflight.connection_status,
      tone: toneForStatus(preflight.connection_status),
      badge: registrationStatusLabel(preflight.connection_status),
    },
  ];
}

function toneForStatus(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  const tone = registrationStatusTone(status);
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  if (tone === 'danger') return 'danger';
  return 'neutral';
}

function firstMessage(messages: string[] | undefined): string | undefined {
  return messages?.find((message) => message.trim());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '알 수 없는 오류');
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cx('h-4 w-4 shrink-0', className)} aria-hidden="true">
      <path d="M3.2 8.4 6.4 11.6 12.8 4.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
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
  return normalized.split(/\s+/).every((token) => haystack.includes(token));
}

export function registrationStatusTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (['available', 'connected', 'online'].includes(status)) return 'ok';
  if (['unavailable', 'failed', 'blocked', 'error', 'expired', 'disconnected'].includes(status)) return 'danger';
  if (['stale', 'warning', 'degraded', 'pending', 'not_registered', 'pending_install'].includes(status)) return 'warn';
  return 'neutral';
}

function registrationStatusLabel(status: string): string {
  if (status === 'available') return '사용 가능';
  if (status === 'unavailable') return '사용 불가';
  if (status === 'connected' || status === 'online') return '연결됨';
  if (status === 'stale') return '지연';
  if (status === 'pending' || status === 'pending_install') return '대기';
  if (status === 'not_registered') return '미등록';
  if (status === 'expired') return '만료';
  if (status === 'error' || status === 'failed') return '오류';
  return status;
}

export function preferredDeployProvider(flow: Pick<RegistrationFlow, 'default_deploy_provider' | 'deploy_providers'>): string {
  return flow.deploy_providers.find((option) => option.key === flow.default_deploy_provider && option.status === 'available')?.key
    ?? flow.deploy_providers.find((option) => option.status === 'available')?.key
    ?? flow.default_deploy_provider
    ?? DEFAULT_DEPLOY_PROVIDER;
}
