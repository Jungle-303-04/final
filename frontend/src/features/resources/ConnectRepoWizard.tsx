// 레포 연결 위저드 — application(+watch target/binding) 생성 (docs/fd/views/resources)
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
import { Button, Field, KeyValue, Modal, Skeleton, Stepper } from '@/shared/ui';
import { uiStore } from '@/shared/lib/ui-store';
import { useConsolePath } from '@/features/console/ui';

const STEPS = ['레포', '배포 대상', '확인'];
const PROBEABLE_REPO = /^([\w.-]+\/[\w.-]+|https?:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+|git@[^:\s]+:[^/\s]+\/[^/\s]+(?:\.git)?)$/;

export function ConnectRepoWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [repoRef, setRepoRef] = useState('');
  const [branch, setBranch] = useState('');
  const [manifestSelection, setManifestSelection] = useState('');
  const [clusterId, setClusterId] = useState('');
  const clustersQ = useClusters();
  const create = useCreateApplication();
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const admin = useIsAdmin();
  const trimmedRepoRef = repoRef.trim();
  const refOk = PROBEABLE_REPO.test(trimmedRepoRef);
  const probeQ = useRepositoryProbe(trimmedRepoRef, open && refOk);
  const normalizedRepoRef = probeQ.data?.normalized_repo_ref || '';
  const branchesQ = useRepositoryBranches(normalizedRepoRef, open && Boolean(probeQ.data?.reachable && normalizedRepoRef));
  const selectedBranch = branch || branchesQ.data?.default_branch || probeQ.data?.default_branch || '';
  const manifestsQ = useRepositoryManifestCandidates(normalizedRepoRef, selectedBranch, open && Boolean(normalizedRepoRef && selectedBranch && probeQ.data?.reachable));
  const candidates = useMemo(() => manifestsQ.data?.candidates ?? [], [manifestsQ.data?.candidates]);
  const selectedCandidate = candidates.find(c => repositoryManifestCandidateValue(c) === manifestSelection);
  const manifestPath = selectedCandidate?.path ?? '';
  const validationQ = useRepositoryManifestValidation(
    normalizedRepoRef,
    selectedBranch,
    manifestPath,
    selectedCandidate?.source_type ?? '',
    open && Boolean(normalizedRepoRef && selectedBranch && manifestPath && selectedCandidate),
  );
  const name = normalizedRepoRef.split('/')[1] ?? '';
  const clusters = clustersQ.data ?? [];
  const selectedCluster = clusters.find(cluster => cluster.cluster_id === clusterId);
  const validation = validationQ.data;
  const manifestNamespace = firstManifestNamespace(validation?.resources ?? []);
  const manifestAccepted = Boolean(validation?.valid);
  const repoStepReady = Boolean(probeQ.data?.reachable && selectedBranch && manifestPath && manifestAccepted);
  // 닫을 때 입력 초기화 — 다음에 열면 항상 1단계부터(중간 상태 잔류 방지)
  const reset = () => {
    setStep(0);
    setRepoRef('');
    setBranch('');
    setManifestSelection('');
    setClusterId('');
    create.reset();
    onClose();
  };

  useEffect(() => {
    setBranch('');
    setManifestSelection('');
  }, [trimmedRepoRef]);

  useEffect(() => {
    if (!open || branch) return;
    const defaultBranch = branchesQ.data?.branches.find(item => item.default)?.name;
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
    if (!candidates.some(candidate => repositoryManifestCandidateValue(candidate) === manifestSelection)) {
      setManifestSelection(repositoryManifestCandidateValue(candidates[0]));
    }
  }, [candidates, manifestSelection, open]);

  return (
    <Modal open={open} title="레포 연결" onClose={reset} size="lg">
      <Stepper steps={STEPS} current={step} />
      {step === 0 && (
        <>
          <Field label="repo_ref" error={repoRef && !refOk ? 'owner/name 또는 GitHub URL 형식이어야 합니다' : undefined}>
            <input className="input" value={repoRef} onChange={e => setRepoRef(e.target.value)} placeholder="owner/name" />
          </Field>
          {probeQ.isPending && <Skeleton lines={1} />}
          {probeQ.data?.reachable && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)', margin: '-4px 0 8px' }}>
              {probeQ.data.normalized_repo_ref}{probeQ.data.default_branch ? ` · 기본 ${probeQ.data.default_branch}` : ''}
            </p>
          )}
          {probeQ.data && !probeQ.data.reachable && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              확인 실패 — {probeQ.data.errors[0] ?? '레포에 접근할 수 없습니다'}
            </p>
          )}
          {probeQ.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              확인 실패 — {(probeQ.error as Error).message}
            </p>
          )}
          <Field label="브랜치">
            {branchesQ.isPending ? <Skeleton lines={1} /> : (
              <select className="input" value={selectedBranch} disabled={!probeQ.data?.reachable || (branchesQ.data?.branches ?? []).length === 0}
                onChange={e => { setBranch(e.target.value); setManifestSelection(''); }}>
                {(branchesQ.data?.branches ?? []).map(item => (
                  <option key={item.name} value={item.name}>{item.name}{item.protected ? ' · 보호됨' : ''}</option>
                ))}
              </select>
            )}
          </Field>
          {branchesQ.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              브랜치 조회 실패 — {(branchesQ.error as Error).message}
            </p>
          )}
          <Field label="manifest">
            {manifestsQ.isPending ? <Skeleton lines={1} /> : (
              <select className="input" value={manifestSelection} disabled={candidates.length === 0} onChange={e => setManifestSelection(e.target.value)}>
                {candidates.map(candidate => (
                  <option key={repositoryManifestCandidateValue(candidate)} value={repositoryManifestCandidateValue(candidate)}>{candidate.display_name}</option>
                ))}
              </select>
            )}
          </Field>
          {manifestsQ.data?.warnings.map(warning => (
            <p key={warning} style={{ fontSize: 'var(--fs-xs)', color: 'var(--warn)', margin: '-2px 0 8px' }}>{warning}</p>
          ))}
          {manifestsQ.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              manifest 조회 실패 — {(manifestsQ.error as Error).message}
            </p>
          )}
          {validationQ.isPending && <Skeleton lines={2} />}
          {validation && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <KeyValue pairs={[
                ['검증', validation.status === 'not_run' ? 'render 대기' : validation.valid ? '통과' : '확인 필요'],
                ['리소스', `${validation.resource_count}`],
                ['방식', validation.validation_mode],
              ]} />
              {validation.resources.length > 0 && (
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-2)', margin: '8px 0 0' }}>
                  {validation.resources.slice(0, 4).map(r => `${r.kind}/${r.name}`).join(', ')}
                  {validation.resources.length > 4 ? ` 외 ${validation.resources.length - 4}개` : ''}
                </p>
              )}
              {[...validation.warnings, ...validation.errors].slice(0, 3).map(message => (
                <p key={message} style={{ fontSize: 'var(--fs-xs)', color: validation.errors.includes(message) ? 'var(--danger)' : 'var(--warn)', margin: '6px 0 0' }}>
                  {message}
                </p>
              ))}
            </div>
          )}
          {validationQ.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              manifest 검증 실패 — {(validationQ.error as Error).message}
            </p>
          )}
          <div style={{ textAlign: 'right' }}>
            <Button variant="primary" disabled={!repoStepReady} onClick={() => { setClusterId(''); setStep(1); }}>다음</Button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          {clustersQ.isError ? (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              클러스터 조회 실패 — {(clustersQ.error as Error).message}
            </p>
          ) : clustersQ.isPending ? <Skeleton lines={2} /> : clusters.length === 0 ? (
            <div style={{ padding: '8px 0' }}>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', margin: '0 0 8px' }}>
                {admin
                  ? '배포 대상으로 지정할 클러스터가 없습니다 — 먼저 클러스터를 등록해주세요.'
                  : '배포 대상으로 지정할 수 있는 클러스터가 없습니다 — 관리자에게 클러스터 접근 권한을 요청해주세요.'}
              </p>
              {admin && <Link to={pathFor('/clusters')} onClick={reset}><Button variant="primary">클러스터 등록하러 가기 →</Button></Link>}
            </div>
          ) : (
            <Field label="대상 클러스터">
              <select className="input" value={clusterId} onChange={e => setClusterId(e.target.value)}>
                <option value="" disabled>클러스터 선택</option>
                {clusters.map(c => <option key={c.cluster_id} value={c.cluster_id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(0)}>이전</Button>
            <Button variant="primary" disabled={!clusterId} onClick={() => setStep(2)}>다음</Button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <KeyValue pairs={[
            ['앱 이름', name],
            ['레포', `${normalizedRepoRef}@${selectedBranch}`],
            ['manifest', manifestPath],
            ['클러스터', selectedCluster?.name ?? clusterId],
            ['네임스페이스', manifestNamespace || '서버 정책'],
            ['환경', selectedCluster?.environment ?? '서버 정책'],
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <Button onClick={() => setStep(1)}>이전</Button>
            <Button variant="primary" loading={create.isPending}
              onClick={() => create.mutate({
                name,
                repo_ref: normalizedRepoRef,
                branch: selectedBranch,
                manifest_path: manifestPath,
                source_type: selectedCandidate?.source_type ?? '',
                cluster_id: clusterId,
                namespace: manifestNamespace,
                environment: selectedCluster?.environment,
              },
                {
                  onSuccess: d => {
                    uiStore.getState().toast('ok', `${name} 연결 완료 — 첫 커밋이 감지되면 run 이 생성됩니다`);
                    reset();
                    nav(pathFor(`/repos/${d.application_id}`));
                  },
                })}>연결</Button>
          </div>
          {create.isError && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
              연결 실패 — {(create.error as Error).message}. 입력을 확인한 뒤 다시 시도해주세요.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

export function repositoryManifestCandidateValue(candidate: RepositoryManifestCandidate): string {
  return `${candidate.source_type}:${candidate.path}`;
}

function firstManifestNamespace(resources: { namespace?: string | null }[]): string | undefined {
  return resources.find(resource => resource.namespace?.trim())?.namespace?.trim();
}
