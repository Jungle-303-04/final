// 클러스터 등록 위저드 — Bruno 02-target-admin 흐름과 동일 API 순서 (docs/fd/views/resources)
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import { Badge, Button, CodeBlock, Field, KeyValue, Modal, Stepper } from '@/shared/ui';
import { queryClient } from '@/shared/lib/query';

const STEPS = ['프로바이더', '검증', '설정', '발급'];

export function RegisterClusterWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState('existing-k8s');
  const [clusterId, setClusterId] = useState('');
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<{ agent_token: string; install_manifest: string } | null>(null);
  const [connected, setConnected] = useState(false);

  // 실백엔드 catalog 는 category 별 객체: { providers: { cloud: [...], deploy: [...], ... } }
  const catalog = useQuery({
    queryKey: ['providers'],
    queryFn: () => get<{ providers: Record<string, { key: string; label: string; status: string }[]> }>('/providers/catalog'),
    enabled: open,
  });
  const cloudProviders = (catalog.data?.providers?.cloud ?? []).filter(p => p.status === 'available');
  const validate = useMutation({ mutationFn: () => post<{ valid: boolean; errors: string[] }>('/providers/validate', { cloud_provider: provider, deploy_provider: 'manual-manifest' }) });
  const register = useMutation({
    mutationFn: () => post<{ agent_token: string; install_manifest: string }>('/targets', {
      cluster_id: clusterId, name: name || clusterId, environment: 'sandbox', apply: false,
      cloud_provider: provider, deploy_provider: 'manual-manifest',
      management_base_url: location.origin, image: 'service:local',
    }),
    onSuccess: d => { setIssued(d); queryClient.invalidateQueries({ queryKey: ['clusters'] }); },
  });
  const checkConn = useMutation({
    mutationFn: () => get<{ connection_status: string }>(`/clusters/${clusterId}/connection-status`),
    onSuccess: d => setConnected(d.connection_status === 'connected'),
  });
  const reset = () => { setStep(0); setIssued(null); setConnected(false); setClusterId(''); setName(''); onClose(); };
  const slugOk = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(clusterId);

  return (
    <Modal open={open} title="클러스터 등록" onClose={reset} size="lg">
      <Stepper steps={STEPS} current={step} />
      {step === 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {cloudProviders.map(p => (
              <button key={p.key} className="card" style={{ cursor: 'pointer', textAlign: 'left', borderColor: provider === p.key ? 'var(--brand)' : 'var(--border)' }}
                onClick={() => setProvider(p.key)}>
                <b>{p.label}</b><p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', margin: '4px 0 0' }}>{p.key}</p>
              </button>
            ))}
          </div>
          <Footer onNext={() => setStep(1)} />
        </>
      )}
      {step === 1 && (
        <>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>선택한 조합: <code>{provider} + manual-manifest</code></p>
          {validate.data && (validate.data.valid ? <Badge tone="ok">조합 유효</Badge> : validate.data.errors.map(e => <p key={e} style={{ color: 'var(--danger)' }}>{e}</p>))}
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
        </>
      )}
      {step === 3 && issued && (
        <>
          <Badge tone="ok">등록 완료</Badge>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)' }}>agent token 은 지금 한 번만 표시됩니다. 저장소·상태에 보관하지 않습니다.</p>
          <Field label="agent token">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" readOnly value={issued.agent_token} style={{ fontFamily: 'var(--font-mono)' }} data-testid="agent-token" />
              <Button onClick={() => navigator.clipboard.writeText(issued.agent_token)}>복사</Button>
            </div>
          </Field>
          <Field label="install manifest — kubectl apply -f 로 적용">
            <CodeBlock code={issued.install_manifest} />
          </Field>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button onClick={() => checkConn.mutate()} loading={checkConn.isPending}>연결 확인</Button>
            {connected && <Badge tone="ok">connected</Badge>}
            <span style={{ marginLeft: 'auto' }}><Button variant="primary" onClick={reset}>완료</Button></span>
          </div>
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
