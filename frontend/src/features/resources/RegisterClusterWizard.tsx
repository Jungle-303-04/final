import { useEffect, useMemo, useState } from 'react';
import {
  CheckIcon as LucideCheckIcon,
  ClipboardIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { get, post } from '@/shared/lib/api';
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

type ProviderFieldSpec = {
  id: string;
  label: string;
  value: string;
  key?: keyof FormState;
  placeholder?: string;
  help?: string;
  error?: string;
  readOnly?: boolean;
  options?: string[];
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
  const [provider, setProvider] = useState<ProviderKind | 'local'>('eks');
  const [localProvider, setLocalProvider] = useState<'kind' | 'minikube'>('kind');
  const [form, setForm] = useState<FormState>(initialForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [issued, setIssued] = useState<TargetInstallResponse | null>(null);
  const [closeGuard, setCloseGuard] = useState(false);
  const [copyTokenState, setCopyTokenState] = useState<'idle' | 'failed'>('idle');
  const [registrationConfirmed, setRegistrationConfirmed] = useState(false);

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
        toast.error('사전 검증 실패', {
          description: firstMessage(data.errors) ?? '입력값을 확인해주세요',
        });
        return;
      }
      setRegistrationConfirmed(false);
      toast.success('서버 검증 통과', {
        description: '등록 대상과 연결 방식을 확인한 뒤 설치 명령을 발급하세요',
      });
    },
    onError: (error) => {
      toast.error('사전 검증 실패', {
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
      toast.success('클러스터 등록 완료', {
        description: '설치 명령을 복사해 대상 클러스터에서 실행하세요',
      });
      void queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
    onError: (error) => {
      toast.error('등록 실패', {
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
  const canRunPreflight = validation.valid && !preflight.isPending && !register.isPending && !issued;
  const canIssueInstall = Boolean(preflight.data?.valid) && registrationConfirmed && !register.isPending && !issued;

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
    setRegistrationConfirmed(false);
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
    setRegistrationConfirmed(false);
  };

  const chooseProvider = (nextProvider: ProviderKind | 'local') => {
    setProvider(nextProvider);
    const nextCloudProvider = nextProvider === 'local' ? localProvider : nextProvider;
    setForm((prev) => applyProviderDefaults(prev, nextCloudProvider));
    preflight.reset();
    register.reset();
    setIssued(null);
    setRegistrationConfirmed(false);
  };

  const chooseLocalProvider = (nextProvider: 'kind' | 'minikube') => {
    setLocalProvider(nextProvider);
    setForm((prev) => applyProviderDefaults(prev, nextProvider));
    preflight.reset();
    register.reset();
    setIssued(null);
    setRegistrationConfirmed(false);
  };

  const runPreflight = () => {
    if (!validation.valid) return;
    preflight.mutate();
  };

  const issueInstall = () => {
    if (!preflight.data?.valid || !registrationConfirmed) return;
    register.mutate();
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
      toast.success('복사 완료', { description: 'agent token을 클립보드에 복사했습니다' });
    } catch {
      setCopyTokenState('failed');
      toast.error('복사 실패', { description: '토큰 값을 직접 선택해 복사해주세요' });
    }
  };

  const copyInstallStep = async (label: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success('복사 완료', { description: `${label}을 클립보드에 복사했습니다` });
    } catch {
      toast.error('복사 실패', { description: '명령을 직접 선택해 복사해주세요' });
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-var(--spacing)*8)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>클러스터 등록</DialogTitle>
            <DialogDescription>
              provider를 선택하고 사전 검증을 통과하면 설치 명령이 발급됩니다
            </DialogDescription>
          </DialogHeader>

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

                <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
                  <CardHeader>
                    <CardTitle className="text-title text-text-primary">등록 정보</CardTitle>
                    <CardDescription className="text-text-secondary">
                      cluster_id는 내부 식별자이며 설치 context 기본값으로 사용됩니다
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="cluster-id">cluster_id</Label>
                      <Input
                        id="cluster-id"
                        value={form.cluster_id}
                        onChange={(event) => setField('cluster_id', event.target.value)}
                        placeholder="prod-seoul-01"
                        data-testid="cluster-id"
                        aria-invalid={Boolean(validation.errors.cluster_id)}
                        aria-describedby="cluster-id-message"
                      />
                      <p id="cluster-id-message" className={cn('text-caption', validation.errors.cluster_id ? 'text-danger' : 'text-text-muted')} role={validation.errors.cluster_id ? 'alert' : undefined}>
                        {validation.errors.cluster_id ?? '소문자, 숫자, 하이픈만 입력'}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cluster-name">표시 이름</Label>
                      <Input
                        id="cluster-name"
                        value={form.name}
                        onChange={(event) => setField('name', event.target.value)}
                        placeholder={form.cluster_id || '운영 클러스터'}
                        aria-invalid={Boolean(validation.errors.name)}
                        aria-describedby={validation.errors.name ? 'cluster-name-error' : undefined}
                      />
                      {validation.errors.name && <p id="cluster-name-error" className="text-caption text-danger" role="alert">{validation.errors.name}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cluster-environment">운영 구분</Label>
                      <Select
                        value={form.environment}
                        onValueChange={(value) => {
                          if (value !== null) setField('environment', value);
                        }}
                        disabled={localInstall}
                      >
                        <SelectTrigger
                          id="cluster-environment"
                          className="w-full"
                          aria-invalid={Boolean(validation.errors.environment)}
                          aria-describedby="cluster-environment-message"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dev">dev</SelectItem>
                          <SelectItem value="stage">stage</SelectItem>
                          <SelectItem value="prod">prod</SelectItem>
                        </SelectContent>
                      </Select>
                      <p id="cluster-environment-message" className={cn('text-caption', validation.errors.environment ? 'text-danger' : 'text-text-muted')} role={validation.errors.environment ? 'alert' : undefined}>
                        {validation.errors.environment ?? (localInstall ? '로컬 클러스터는 dev로 기록됩니다' : '목록과 배포 필터에 쓰는 환경 라벨입니다')}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cluster-install-method">설치 방식</Label>
                      <Input id="cluster-install-method" value="수동 manifest" readOnly aria-describedby="cluster-install-method-help" />
                      <p id="cluster-install-method-help" className="text-caption text-text-muted">수동 manifest 설치 흐름으로 고정됩니다</p>
                    </div>
                  </CardContent>
                </Card>

                <ProviderFields
                  provider={activeCloudProvider}
                  form={form}
                  errors={validation.errors}
                  onFieldChange={setField}
                />

                <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
                  <CardHeader>
                    <CardTitle className="text-title text-text-primary">사전 요구사항</CardTitle>
                    <CardDescription className="text-text-secondary">터미널에서 설치 명령을 실행하기 전에 준비되어야 합니다</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-2 text-body text-text-secondary">
                      {prerequisites.map((item) => (
                        <li key={item} className="flex min-w-0 items-start gap-2">
                          <CheckIcon className="mt-0.5 text-success" />
                          <span className="min-w-0">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                    고급 설정
                  </CollapsibleTrigger>
                  <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-[var(--motion-base)] ease-[var(--ease-out)] data-ending-style:h-0 data-starting-style:h-0 motion-reduce:h-auto motion-reduce:transition-none">
                    <div className="mt-3 grid gap-2">
                      <Label htmlFor="management-base-url">management_base_url</Label>
                      <Input
                        id="management-base-url"
                        value={form.management_base_url}
                        onChange={(event) => setField('management_base_url', event.target.value)}
                        placeholder="https://k8s.example.com"
                        aria-describedby="management-base-url-help"
                      />
                      <p id="management-base-url-help" className="text-caption text-text-muted">비워두면 서버 기본 공개 URL을 사용합니다</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <ValidationPanel preflight={preflight.data} pending={preflight.isPending || register.isPending} error={preflight.error ?? register.error} />

                {preflight.data?.valid && (
                  <div className="grid gap-3 border-y border-border py-4">
                    <RegistrationTargetPreview
                      clusterId={form.cluster_id}
                      name={form.name}
                      environment={form.environment}
                      provider={activeCloudProvider}
                      managementBaseUrl={form.management_base_url}
                      kubeContext={providerConfig(form, activeCloudProvider).context_alias ?? providerConfig(form, activeCloudProvider).context_name}
                    />
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                      <Checkbox
                        id="cluster-register-confirmation"
                        checked={registrationConfirmed}
                        onCheckedChange={(checked) => setRegistrationConfirmed(checked === true)}
                        aria-describedby="cluster-register-confirmation-help"
                      />
                      <Label htmlFor="cluster-register-confirmation">검증 결과와 설치 대상이 맞는지 확인했습니다</Label>
                      <p id="cluster-register-confirmation-help" className="col-start-2 text-caption text-text-muted">
                        설치 명령은 짧은 유효 기간의 agent token을 포함하며, 대상 클러스터에서만 실행해야 합니다.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-caption text-text-muted">서버 검증과 설치 명령 발급은 별도 단계입니다</p>
                  <div className="flex flex-wrap gap-2">
                    {preflight.data?.valid && (
                      <Button type="button" variant="secondary" disabled={!canRunPreflight} aria-busy={preflight.isPending} onClick={runPreflight}>
                        {preflight.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                        다시 검증
                      </Button>
                    )}
                    <Button
                      type="button"
                      disabled={preflight.data?.valid ? !canIssueInstall : !canRunPreflight}
                      aria-busy={preflight.isPending || register.isPending}
                      onClick={preflight.data?.valid ? issueInstall : runPreflight}
                      data-testid="cluster-register-confirm"
                    >
                      {(preflight.isPending || register.isPending) && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                      {preflight.data?.valid ? '설치 명령 발급' : '서버 검증 실행'}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
                  <CardHeader>
                    <CardTitle className="text-title text-text-primary">설치 명령</CardTitle>
                    <CardDescription className="text-text-secondary">대상 클러스터에 접근 가능한 터미널에서 실행하세요</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <Alert className="border-warning text-warning">
                      <TriangleAlertIcon aria-hidden="true" />
                      <AlertTitle>agent 자격증명 포함</AlertTitle>
                      <AlertDescription className="text-text-secondary">이 명령은 한 번만 안전하게 보관하세요.</AlertDescription>
                    </Alert>
                    <div className="grid gap-3 rounded-panel border border-border bg-bg p-4 text-body text-text-secondary">
                      <p>클러스터에서 아웃바운드 HTTPS만 가능하면 management API와 연결할 수 있습니다.</p>
                      {issued.connect_expires_at && (
                        <p className="text-caption text-text-muted">연결 대기 만료: {fmtAbs(issued.connect_expires_at)} · {remainingLabel(issued.connect_expires_at)}</p>
                      )}
                    </div>
                    {installSteps.length > 0 ? (
                      <div className="grid gap-3">
                        {installSteps.map((step, index) => (
                          <Card key={`${step.label}-${index}`} size="sm" className="rounded-panel border border-border bg-bg ring-0">
                            <CardHeader className="flex-row items-center justify-between">
                              <CardTitle className="text-label text-text-primary">{step.label}</CardTitle>
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={`${step.label} 복사`} onClick={() => void copyInstallStep(step.label, step.command)}>
                                <ClipboardIcon aria-hidden="true" />
                              </Button>
                            </CardHeader>
                            <CardContent>
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control bg-raised p-3 font-mono text-caption text-text-secondary" tabIndex={0}><code>{step.command}</code></pre>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card className="rounded-panel border border-dashed border-border bg-bg text-center ring-0">
                        <CardHeader>
                          <CardTitle className="text-title text-text-primary">설치 명령 없음</CardTitle>
                          <CardDescription className="text-text-secondary">서버가 설치 명령을 아직 반환하지 않았습니다. manifest를 수동으로 저장해 kubectl apply -f로 적용하세요</CardDescription>
                        </CardHeader>
                      </Card>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="agent-token">agent token</Label>
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                        <Input id="agent-token" value={issued.agent_token} readOnly className="font-mono text-caption" data-testid="agent-token" aria-describedby="agent-token-help" />
                        <Button type="button" variant="outline" onClick={() => void copyToken()}>
                          <ClipboardIcon aria-hidden="true" />
                          토큰 복사
                        </Button>
                      </div>
                      <p id="agent-token-help" className={cn('text-caption', copyTokenState === 'failed' ? 'text-danger' : 'text-text-muted')}>
                        {copyTokenState === 'failed' ? '복사 권한이 없으면 값을 직접 선택해 복사하세요' : '토큰 원문은 현재 화면에서만 확인할 수 있습니다'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
                  <CardHeader>
                    <CardTitle className="text-title text-text-primary">연결 대기</CardTitle>
                    <CardDescription className="text-text-secondary">명령 실행 후 보통 30초~1분 내 연결됩니다</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {connQ.isError && (
                      <Alert variant="destructive">
                        <TriangleAlertIcon aria-hidden="true" />
                        <AlertTitle>연결 상태 조회 실패</AlertTitle>
                        <AlertDescription>{errorMessage(connQ.error)}</AlertDescription>
                        <Button type="button" variant="outline" size="sm" onClick={() => void connQ.refetch()}>다시 시도</Button>
                      </Alert>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Badge variant="outline" className={statusBadgeClass(connectionStatus.tone)}>{connectionStatus.label}</Badge>
                      <Button type="button" size="sm" variant="outline" onClick={() => void connQ.refetch()} disabled={connQ.isFetching} aria-busy={connQ.isFetching}>
                        <RefreshCwIcon className={cn(connQ.isFetching && 'animate-spin')} aria-hidden="true" />
                        지금 확인
                      </Button>
                    </div>
                    <dl className="grid gap-3 rounded-panel border border-border bg-bg p-4">
                      {[
                        { label: 'cluster_id', value: issued.cluster_id },
                        { label: '상태', value: connectionStatus.raw },
                        { label: '설치 만료', value: issued.connect_expires_at ? `${fmtAbs(issued.connect_expires_at)} · ${remainingLabel(issued.connect_expires_at)}` : '서버 기본 정책' },
                      ].map((item) => (
                        <div key={item.label} className="grid gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                          <dt className="text-label font-semibold text-text-muted">{item.label}</dt>
                          <dd className="break-words text-body text-text-primary">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {connectionStatus.kind === 'pending' && (
                      <p className="text-body text-text-secondary">터미널에서 명령을 실행하면 5초 간격으로 연결 상태를 확인합니다.</p>
                    )}
                    {(connectionStatus.kind === 'expired' || connectionStatus.kind === 'error') && (
                      <Alert className="border-warning">
                        <TriangleAlertIcon className="text-warning" aria-hidden="true" />
                        <AlertTitle>새 설치 명령 필요</AlertTitle>
                        <AlertDescription className="text-text-secondary">
                          설치 토큰이 만료되었거나 연결 확인 중 오류가 발생했습니다. 새 명령을 재발급하거나 목록에서 등록 항목을 정리한 뒤 다시 등록하세요.
                        </AlertDescription>
                        <div className="col-start-2 mt-3 flex flex-wrap gap-2">
                          <Button type="button" disabled={!validation.valid || preflight.isPending || register.isPending} aria-busy={preflight.isPending || register.isPending} onClick={reissue}>
                            {(preflight.isPending || register.isPending) && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                            재발급
                          </Button>
                          <Button type="button" variant="secondary" onClick={resetForClose}>목록으로 이동</Button>
                        </div>
                      </Alert>
                    )}
                    {connected && (
                      <Card className="rounded-panel border border-success bg-bg text-center ring-0" role="status" aria-live="polite">
                        <CardHeader>
                          <CardTitle className="text-title text-success">클러스터 연결 완료</CardTitle>
                          <CardDescription className="text-text-secondary">이제 evidence 정책과 인벤토리 수집 상태를 확인할 수 있습니다</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button type="button" onClick={resetForClose}>evidence 정책 보기</Button>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={closeGuard} onOpenChange={setCloseGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>설치 흐름 닫기</AlertDialogTitle>
            <AlertDialogDescription>
              아직 연결되지 않았습니다. agent token은 다시 볼 수 없으므로 설치 명령을 복사했는지 확인해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCloseGuard(false)}>계속 보기</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={resetForClose}>닫기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
      <CardHeader>
        <CardTitle className="text-title text-text-primary">Provider</CardTitle>
        <CardDescription className="text-text-secondary">설치 명령을 생성할 클러스터 provider를 선택합니다</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {discovery.isPending && (
          <div className="grid gap-3 md:grid-cols-2" aria-label="Provider 불러오는 중">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 w-full rounded-panel" />)}
          </div>
        )}

        {discovery.isError && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>Provider 조회 실패</AlertTitle>
            <AlertDescription>{errorMessage(discovery.error)}</AlertDescription>
            <Button type="button" variant="outline" size="sm" onClick={() => void discovery.refetch()}>다시 시도</Button>
          </Alert>
        )}

        {!discovery.isPending && !discovery.isError && (
          <div className="grid gap-3 md:grid-cols-2">
            {providerOptions.map((option) => {
              const selected = provider === option.key;
              const flow = option.key === 'local'
                ? findFlow(discovery.data?.flows ?? [], localProvider)
                : findFlow(discovery.data?.flows ?? [], option.key);
              const tone = flow ? toneForStatus(flow.status) : 'neutral';
              return (
                <Button
                  key={option.key}
                  type="button"
                  variant="outline"
                  aria-pressed={selected}
                  className={cn(
                    'h-auto min-h-28 items-start justify-start whitespace-normal rounded-panel border bg-surface p-4 text-left',
                    selected ? 'border-brand bg-raised shadow-soft' : 'border-border hover:border-border-strong hover:bg-raised',
                  )}
                  onClick={() => onProviderChange(option.key)}
                >
                  <span className="grid w-full min-w-0 gap-3">
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-title font-semibold text-text-primary">{option.label}</span>
                        <span className="mt-1 block text-body font-normal text-text-secondary">{option.description}</span>
                      </span>
                      <Badge variant="outline" className={statusBadgeClass(tone)}>
                        {flow ? registrationStatusLabel(flow.status) : option.badge}
                      </Badge>
                    </span>
                    {flow?.unavailable_reason && <span className="text-caption font-normal text-warning">{flow.unavailable_reason}</span>}
                  </span>
                </Button>
              );
            })}
          </div>
        )}

        {provider === 'local' && !discovery.isPending && !discovery.isError && (
          <div className="grid grid-cols-2 gap-2 rounded-panel border border-border bg-bg p-1">
            {(['kind', 'minikube'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={localProvider === value ? 'default' : 'ghost'}
                aria-pressed={localProvider === value}
                onClick={() => onLocalProviderChange(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        )}

        <dl className="grid gap-3 rounded-panel border border-border bg-bg p-4">
          {[
            { label: '선택 provider', value: activeCloudProvider },
            { label: '서버 discovery', value: selectedFlow ? registrationStatusLabel(selectedFlow.status) : 'preflight에서 확인' },
            { label: '설치 방식', value: '수동 manifest' },
          ].map((item) => (
            <div key={item.label} className="grid gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
              <dt className="text-label font-semibold text-text-muted">{item.label}</dt>
              <dd className="break-words text-body text-text-primary">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
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
  const content = providerFieldContent(provider, form, errors);

  return (
    <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
      <CardHeader>
        <CardTitle className="text-title text-text-primary">{content.title}</CardTitle>
        <CardDescription className="text-text-secondary">{content.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {content.fields.map((field) => {
          const messageId = `${field.id}-message`;
          return (
            <div key={field.id} className="grid gap-2">
              <Label htmlFor={field.id}>{field.label}</Label>
              {field.options ? (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (value !== null && field.key) onFieldChange(field.key, value);
                  }}
                >
                  <SelectTrigger id={field.id} className="w-full" aria-describedby={field.help || field.error ? messageId : undefined} aria-invalid={Boolean(field.error)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={field.id}
                  value={field.value}
                  readOnly={field.readOnly}
                  onChange={field.key ? (event) => onFieldChange(field.key!, event.target.value) : undefined}
                  placeholder={field.placeholder}
                  aria-describedby={field.help || field.error ? messageId : undefined}
                  aria-invalid={Boolean(field.error)}
                />
              )}
              {(field.error || field.help) && (
                <p id={messageId} className={cn('text-caption', field.error ? 'text-danger' : 'text-text-muted')} role={field.error ? 'alert' : undefined}>
                  {field.error ?? field.help}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function providerFieldContent(
  provider: ProviderKind,
  form: FormState,
  errors: Validation['errors'],
): { title: string; description: string; fields: ProviderFieldSpec[] } {
  const editable = (
    key: keyof FormState,
    label: string,
    value: string,
    placeholder?: string,
    help?: string,
  ): ProviderFieldSpec => ({
    id: `provider-${String(key).replaceAll('_', '-')}`,
    key,
    label,
    value,
    placeholder,
    help,
    error: errors[key],
  });

  if (provider === 'eks') {
    return {
      title: 'EKS 설정',
      description: 'aws CLI가 생성한 kubeconfig context에 agent를 설치합니다',
      fields: [
        editable('region', 'region', form.region, 'ap-northeast-2'),
        editable('eks_cluster_name', 'eks_cluster_name', form.eks_cluster_name, 'production-eks'),
        editable('context_alias', 'context_alias', form.context_alias, form.cluster_id || 'prod-seoul-01', '기본값은 cluster_id입니다'),
      ],
    };
  }

  if (provider === 'gke') {
    return {
      title: 'GKE 설정',
      description: 'gcloud get-credentials 후 target agent를 설치합니다',
      fields: [
        editable('project_id', 'project_id', form.project_id, 'platform-prod'),
        {
          id: 'provider-location-type',
          key: 'location_type',
          label: 'location_type',
          value: form.location_type,
          options: ['region', 'zone'],
        },
        editable('location', 'location', form.location, 'asia-northeast3'),
        editable('gke_cluster_name', 'gke_cluster_name', form.gke_cluster_name, 'production-gke'),
        editable('context_alias', 'context_alias', form.context_alias, form.cluster_id || 'prod-seoul-01', '기본값은 cluster_id입니다'),
      ],
    };
  }

  if (provider === 'aks') {
    return {
      title: 'AKS 설정',
      description: 'az CLI credential 로드 후 target agent를 설치합니다',
      fields: [
        editable('resource_group', 'resource_group', form.resource_group, 'rg-platform-prod'),
        editable('aks_cluster_name', 'aks_cluster_name', form.aks_cluster_name, 'production-aks'),
        editable('context_alias', 'context_alias', form.context_alias, form.cluster_id || 'prod-seoul-01', '기본값은 cluster_id입니다'),
      ],
    };
  }

  if (provider === 'kind') {
    return {
      title: 'kind 설정',
      description: 'kind context에 target agent를 설치합니다',
      fields: [
        editable('kind_cluster_name', 'kind_cluster_name', form.kind_cluster_name, form.cluster_id || 'jungle-dev'),
        { id: 'provider-kind-context', label: 'context', value: kindContext(form), readOnly: true, help: 'kind-<name> 형식으로 사용됩니다' },
      ],
    };
  }

  if (provider === 'minikube') {
    return {
      title: 'minikube 설정',
      description: 'minikube profile context에 target agent를 설치합니다',
      fields: [
        editable('minikube_profile', 'profile', form.minikube_profile, 'minikube'),
        { id: 'provider-minikube-context', label: 'context', value: form.minikube_profile || 'minikube', readOnly: true, help: 'profile 이름을 context로 사용합니다' },
      ],
    };
  }

  return {
    title: 'Existing Kubernetes 설정',
    description: '이미 준비된 kubeconfig context에 target agent를 설치합니다',
    fields: [
      editable('context_name', 'context_name', form.context_name, 'arn:aws:eks:ap-northeast-2:123456789012:cluster/prod'),
    ],
  };
}

function RegistrationTargetPreview({
  clusterId,
  name,
  environment,
  provider,
  managementBaseUrl,
  kubeContext,
}: {
  clusterId: string;
  name: string;
  environment: string;
  provider: ProviderKind;
  managementBaseUrl: string;
  kubeContext?: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch" aria-label="클러스터 등록 대상 확인">
      <section className="grid gap-1 rounded-panel border border-border bg-bg p-3">
        <span className="text-caption font-semibold text-text-muted">Management plane</span>
        <strong className="truncate text-body text-text-primary" title={managementBaseUrl || undefined}>
          {managementBaseUrl || '서버 기본 공개 URL'}
        </strong>
        <span className="text-caption text-text-secondary">target agent 설치 명령을 발급합니다</span>
      </section>
      <div className="hidden items-center justify-center text-caption font-bold text-text-muted md:flex" aria-hidden="true">-&gt;</div>
      <section className="grid gap-1 rounded-panel border border-border bg-bg p-3">
        <span className="text-caption font-semibold text-text-muted">Target cluster</span>
        <strong className="truncate text-body text-text-primary" title={name || clusterId}>{name || clusterId}</strong>
        <span className="text-caption text-text-secondary">
          {clusterId} / {environment} / {provider}
          {kubeContext ? ` / ${kubeContext}` : ''}
        </span>
      </section>
    </div>
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
      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0" aria-busy="true">
        <CardHeader>
          <CardTitle className="text-title text-text-primary">서버 검증</CardTitle>
          <CardDescription className="text-text-secondary">중복, provider 준비 상태, 설치 설정을 확인 중입니다</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden="true" />
        <AlertTitle>서버 검증 실패</AlertTitle>
        <AlertDescription>{errorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (!preflight) {
    return (
      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardHeader>
          <CardTitle className="text-title text-text-primary">서버 검증</CardTitle>
          <CardDescription className="text-text-secondary">확인을 누르면 등록 전에 서버 검증을 먼저 실행합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body text-text-secondary">중복 cluster_id, provider 지원 여부, management URL 설정을 검증합니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
      <CardHeader>
        <CardTitle className="text-title text-text-primary">서버 검증 결과</CardTitle>
        <CardDescription className="text-text-secondary">{preflight.valid ? '등록 가능한 상태입니다' : '아래 항목을 수정해야 합니다'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          {preflightItems(preflight).map((item) => (
            <div key={item.label} className="grid gap-2 rounded-panel border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-label font-semibold text-text-muted">{item.label}</span>
                <Badge variant="outline" className={statusBadgeClass(item.tone)}>{item.badge}</Badge>
              </div>
              <span className="truncate text-body text-text-secondary">{item.value}</span>
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
      </CardContent>
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
          <div className={cn(
            'h-2 rounded-control',
            step.done ? 'bg-success' : step.active ? 'bg-brand' : 'bg-raised',
          )} />
          <p className={cn('mt-2 truncate text-caption font-semibold', step.active || step.done ? 'text-text-primary' : 'text-text-muted')}>{step.label}</p>
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

function statusBadgeClass(tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'): string {
  if (tone === 'success') return 'border-success/40 bg-success/10 text-success';
  if (tone === 'warning') return 'border-warning/40 bg-warning/10 text-warning';
  if (tone === 'danger') return 'border-danger/40 bg-danger/10 text-danger';
  if (tone === 'info') return 'border-info/40 bg-info/10 text-info';
  return 'border-border bg-raised text-text-secondary';
}

function firstMessage(messages: string[] | undefined): string | undefined {
  return messages?.find((message) => message.trim());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '알 수 없는 오류');
}

function CheckIcon({ className }: { className?: string }) {
  return <LucideCheckIcon className={cn('h-4 w-4 shrink-0', className)} aria-hidden="true" />;
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
