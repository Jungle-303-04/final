// 레포 연결 위저드 — application(+watch target/binding) 생성 (docs/fd/views/resources)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateApplication } from '@/features/repo/api';
import { useClusters } from '@/features/cluster/api';
import { Button, Field, KeyValue, Modal, Stepper } from '@/shared/ui';

const STEPS = ['레포', '배포 대상', '확인'];

export function ConnectRepoWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [repoRef, setRepoRef] = useState('');
  const [branch, setBranch] = useState('main');
  const [manifestPath, setManifestPath] = useState('deploy.yaml');
  const [clusterId, setClusterId] = useState('');
  const clustersQ = useClusters();
  const create = useCreateApplication();
  const nav = useNavigate();
  const refOk = /^[\w.-]+\/[\w.-]+$/.test(repoRef);
  const name = repoRef.split('/')[1] ?? '';

  return (
    <Modal open={open} title="레포 연결" onClose={onClose} size="lg">
      <Stepper steps={STEPS} current={step} />
      {step === 0 && (
        <>
          <Field label="repo_ref (owner/name)" error={repoRef && !refOk ? 'owner/name 형식이어야 합니다' : undefined}>
            <input className="input" value={repoRef} onChange={e => setRepoRef(e.target.value)} placeholder="Jungle-303-04/final" />
          </Field>
          <Field label="브랜치"><input className="input" value={branch} onChange={e => setBranch(e.target.value)} /></Field>
          <Field label="manifest 경로"><input className="input" value={manifestPath} onChange={e => setManifestPath(e.target.value)} placeholder="deploy.yaml · k8s/ · kustomization.yaml" /></Field>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: -6 }}>
            단일 YAML(문서 여러 개 <code>---</code> 구분 지원), 디렉터리(하위 .yaml/.yml/.json 전부),
            <code>kustomization.yaml</code>, Helm <code>Chart.yaml</code> 경로를 모두 지원합니다.
          </p>
          <div style={{ textAlign: 'right' }}><Button variant="primary" disabled={!refOk} onClick={() => { setClusterId(clustersQ.data?.[0]?.cluster_id ?? ''); setStep(1); }}>다음</Button></div>
        </>
      )}
      {step === 1 && (
        <>
          <Field label="대상 클러스터">
            <select className="input" value={clusterId} onChange={e => setClusterId(e.target.value)}>
              {(clustersQ.data ?? []).map(c => <option key={c.cluster_id} value={c.cluster_id}>{c.name}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(0)}>이전</Button>
            <Button variant="primary" disabled={!clusterId} onClick={() => setStep(2)}>다음</Button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <KeyValue pairs={[['앱 이름', name], ['레포', `${repoRef}@${branch}`], ['manifest', manifestPath], ['클러스터', clusterId]]} />
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>등록 후 webhook/poller 가 첫 커밋을 감지하면 run 이 생성됩니다.</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button onClick={() => setStep(1)}>이전</Button>
            <Button variant="primary" loading={create.isPending}
              onClick={() => create.mutate({ name, repo_ref: repoRef, branch, manifest_path: manifestPath, cluster_id: clusterId },
                { onSuccess: d => { onClose(); nav(`/repos/${d.application_id}`); } })}>연결</Button>
          </div>
          {create.isError && <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{(create.error as Error).message}</p>}
        </>
      )}
    </Modal>
  );
}
