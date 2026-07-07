// 클러스터 등록 위저드 — Bruno 02-target-admin 흐름과 동일 API 순서 (docs/fd/views/resources)
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import { Badge, Button, CodeBlock, copyToClipboard, Field, KeyValue, Modal, Skeleton, Stepper } from '@/shared/ui';
import { uiStore } from '@/shared/lib/ui-store';
import { queryClient } from '@/shared/lib/query';

const STEPS = ['프로바이더', '검증', '설정', '발급'];

export function RegisterClusterWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState('existing-k8s');
  const [clusterId, setClusterId] = useState('');
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<{ agent_token: string; install_manifest: string; install_command?: string } | null>(null);
  const [closeGuard, setCloseGuard] = useState(false); // 토큰 미확인 상태에서 실수로 닫기 방지

  // 실백엔드 catalog 는 category 별 객체: { providers: { cloud: [...], deploy: [...], ... } }
  const catalog = useQuery({
    queryKey: ['providers'],
    queryFn: () => get<{ providers: Record<string, { key: string; label: string; status: string }[]> }>('/providers/catalog'),
    enabled: open,
  });
  const cloudProviders = (catalog.data?.providers?.cloud ?? []).filter(p => p.status === 'available');
  const validate = useMutation({ mutationFn: () => post<{ valid: boolean; errors: string[] }>('/providers/validate', { cloud_provider: provider, deploy_provider: 'manual-manifest' }) });
  const register = useMutation({
    mutationFn: () => post<{ agent_token: string; install_manifest: string; install_command?: string }>('/targets', {
      cluster_id: clusterId, name: name || clusterId, environment: 'sandbox', apply: false,
      cloud_provider: provider, deploy_provider: 'manual-manifest',
      management_base_url: `${location.origin}/api`,
    }),
    onSuccess: d => {
      setIssued(d);
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      uiStore.getState().toast('ok', `클러스터 ${clusterId} 등록 완료 — 에이전트를 설치해주세요`);
    },
  });
  // 발급 후 5초 간격 자동 폴링 — 에이전트가 붙는 순간 connected 로 전환된다.
  const connQ = useQuery({
    queryKey: ['cluster-conn', clusterId],
    queryFn: () => get<{ connection_status: string }>(`/clusters/${clusterId}/connection-status`),
    enabled: step === 3 && !!issued,
    refetchInterval: q => (q.state.data?.connection_status === 'connected' ? false : 5000),
  });
  const connected = connQ.data?.connection_status === 'connected';
  const reset = () => { setStep(0); setIssued(null); setClusterId(''); setName(''); setCloseGuard(false); validate.reset(); register.reset(); onClose(); };
  // 발급 직후(미연결) ESC/오버레이 클릭 — 토큰은 1회만 표시되므로 한 번 더 확인
  const guardedClose = () => {
    if (step === 3 && issued && !connected && !closeGuard) { setCloseGuard(true); return; }
    reset();
  };
  const slugOk = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(clusterId);

  return (
    <Modal open={open} title="클러스터 등록" onClose={guardedClose} size="lg">
      <Stepper steps={STEPS} current={step} />
      {step === 0 && (
        <>
          {catalog.isPending && <Skeleton lines={3} />}
          {catalog.isError && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', margin: 0 }}>
                프로바이더 목록을 불러오지 못했습니다 — {(catalog.error as Error).message}
              </p>
              <Button size="sm" onClick={() => catalog.refetch()} loading={catalog.isFetching}>다시 시도</Button>
            </div>
          )}
          {catalog.isSuccess && cloudProviders.length === 0 && (
            <p style={{ color: 'var(--warn)', fontSize: 'var(--fs-sm)' }}>사용 가능한 프로바이더가 없습니다 — 관리자에게 문의해주세요.</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {cloudProviders.map(p => (
              <button key={p.key} className="card" style={{ cursor: 'pointer', textAlign: 'left', borderColor: provider === p.key ? 'var(--brand)' : 'var(--border)' }}
                onClick={() => setProvider(p.key)}>
                <b>{p.label}</b><p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', margin: '4px 0 0' }}>{p.key}</p>
              </button>
            ))}
          </div>
          <Footer onNext={() => setStep(1)} nextDisabled={!catalog.isSuccess || cloudProviders.length === 0} />
        </>
      )}
      {step === 1 && (
        <>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>선택한 조합: <code>{provider} + manual-manifest</code></p>
          {validate.data && (validate.data.valid ? <Badge tone="ok">조합 유효</Badge> : validate.data.errors.map(e => <p key={e} style={{ color: 'var(--danger)' }}>{e}</p>))}
          {validate.isError && <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>검증 실패 — {(validate.error as Error).message}</p>}
          <Footer onPrev={() => setStep(0)}
            onNext={() => validate.mutate(undefined, { onSuccess: d => d.valid && setStep(2) })}
            nextLabel="검증 후 다음" loading={validate.isPending} />
        </>
      )}
      {step === 2 && (
        <>
          <Field label="cluster_id (소문자 slug)" error={clusterId && !slugOk ? '소문자·숫자·하이픈만 가능합니다' : undefined}>
            <input className="input" value={clusterId} onChange={e => setClusterId(e.target.value)} placeholder="prod-seoul" data-testid="cluster-id" />
          </Field>
          <Field label="표시 이름"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={clusterId} /></Field>
          <KeyValue pairs={[['environment', 'sandbox'], ['관측 스택', '기본값 (prometheus/loki/tempo .target.svc)']]} />
          <Footer onPrev={() => setStep(1)} onNext={() => register.mutate(undefined, { onSuccess: () => setStep(3) })}
            nextDisabled={!slugOk} nextLabel="등록 실행" loading={register.isPending} />
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
              ? <Badge tone="ok">connected — 에이전트 연결 완료</Badge>
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
              위 install manifest 를 대상 클러스터에 <code>kubectl apply -f</code> 하면 에이전트가 관리
              플레인으로 접속합니다. 적용 후 보통 30초~1분 안에 자동으로 connected 로 바뀝니다 (5초 간격 자동 확인).
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
