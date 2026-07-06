// 생성 플로우 모음 — 각 "+/생성" 버튼에서 열리는 멀티스텝 위저드/폼 모달
import { useEffect, useState } from 'react';
import { Button, Card, Chip, FormField, Input, Modal, Switch, TabList, WizardModal } from '@/plural-ui';
import { AwsIcon, AzureIcon, GcpIcon, PluralMarkIcon } from '@/plural-ui/icons';

/* ── 1. 클러스터 생성 위저드 (CD) ─────── */
export function CreateClusterWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState<'AWS' | 'GCP' | 'Azure'>('AWS');
  const [name, setName] = useState('');

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="클러스터 생성"
      steps={[
        {
          label: '공급자',
          content: (
            <div className="pl-grid-cards">
              {(
                [
                  { key: 'AWS', icon: <AwsIcon size={22} />, desc: 'EKS — us-east-1 외 4개 리전' },
                  { key: 'GCP', icon: <GcpIcon size={22} />, desc: 'GKE — asia-northeast3 외 3개 리전' },
                  { key: 'Azure', icon: <AzureIcon size={22} />, desc: 'AKS — koreacentral 외 3개 리전' },
                ] as const
              ).map((p) => (
                <div key={p.key} onClick={() => setProvider(p.key)} style={{ cursor: 'pointer' }}>
                  <Card className={provider === p.key ? '' : ''}>
                    <div className="pl-row pl-row--between">
                      <div className="pl-row">
                        {p.icon} <b>{p.key}</b>
                      </div>
                      {provider === p.key && <Chip severity="info">선택됨</Chip>}
                    </div>
                    <p className="pl-muted" style={{ marginTop: 8 }}>
                      {p.desc}
                    </p>
                  </Card>
                </div>
              ))}
            </div>
          ),
        },
        {
          label: '스펙',
          content: (
            <>
              <FormField label="클러스터 이름">
                <Input value={name} onChange={setName} placeholder="prod-us1-18" />
              </FormField>
              <FormField label="리전">
                <Input value="us-east-1" />
              </FormField>
              <FormField label="쿠버네티스 버전">
                <Input value="v1.32.4" />
              </FormField>
              <FormField label="노드 수">
                <Input value="100" />
              </FormField>
            </>
          ),
        },
        {
          label: '검토',
          content: (
            <div className="pl-codeblock">
              provider: {provider}
              {'\n'}name: {name || 'prod-us1-18'}
              {'\n'}region: us-east-1{'\n'}version: v1.32.4{'\n'}nodes: 100{'\n'}
              {'\n'}# 생성을 누르면 Terraform 스택이 트리거됩니다 (mock)
            </div>
          ),
        },
      ]}
    />
  );
}

/* ── 2. Git 저장소 가져오기 ───────────── */
export function ImportRepoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [auth, setAuth] = useState<'ssh' | 'https'>('https');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Git 저장소 가져오기"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onClose}>
            가져오기
          </Button>
        </>
      }
    >
      <FormField label="저장소 URL">
        <Input placeholder="https://github.com/Jungle-303-04/new-repo.git" />
      </FormField>
      <FormField label="인증 방식">
        <TabList
          tabs={[
            { key: 'https', label: 'HTTPS 토큰' },
            { key: 'ssh', label: 'SSH 키' },
          ]}
          value={auth}
          onChange={setAuth}
        />
      </FormField>
      {auth === 'https' ? (
        <FormField label="액세스 토큰">
          <Input type="password" placeholder="ghp_..." />
        </FormField>
      ) : (
        <FormField label="SSH 개인 키">
          <Input type="password" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
        </FormField>
      )}
    </Modal>
  );
}

/* ── 3. 스택 생성 위저드 ──────────────── */
export function CreateStackWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<'terraform' | 'ansible'>('terraform');
  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="스택 생성"
      steps={[
        {
          label: '저장소',
          content: (
            <>
              <FormField label="Git 저장소">
                <Input value="https://github.com/Jungle-303-04/infra.git" />
              </FormField>
              <FormField label="폴더">
                <Input placeholder="terraform/network" />
              </FormField>
              <FormField label="레퍼런스">
                <Input value="main" />
              </FormField>
            </>
          ),
        },
        {
          label: '유형',
          content: (
            <FormField label="IaC 도구">
              <TabList
                tabs={[
                  { key: 'terraform', label: 'Terraform' },
                  { key: 'ansible', label: 'Ansible' },
                ]}
                value={type}
                onChange={setType}
              />
            </FormField>
          ),
        },
        {
          label: '변수',
          content: (
            <>
              <FormField label="이름">
                <Input placeholder="my-stack" />
              </FormField>
              <FormField label="환경 변수" hint="key=value, 줄바꿈으로 구분">
                <Input placeholder="AWS_REGION=us-east-1" />
              </FormField>
              <FormField label="자동 승인">
                <Switch checked={false} onChange={() => {}} />
              </FormField>
            </>
          ),
        },
      ]}
    />
  );
}

/* ── 4. 스택 실행 트리거 ──────────────── */
export function TriggerRunModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="실행 트리거"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onClose}>
            실행
          </Button>
        </>
      }
    >
      <FormField label="커밋">
        <Input value="main @ 96a049dc" />
      </FormField>
      <FormField label="메시지">
        <Input placeholder="수동 실행 사유 (선택)" />
      </FormField>
      <p className="pl-muted" style={{ margin: 0 }}>
        plan 단계 후 승인 게이트에서 멈춥니다. 자동 승인은 스택 설정에서 켤 수 있어요.
      </p>
    </Modal>
  );
}

/* ── 5. 워크벤치 생성 위저드 ──────────── */
export function CreateWorkbenchWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tools, setTools] = useState<string[]>(['kubectl', 'promql']);
  const toggle = (t: string) => setTools((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));
  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="워크벤치 생성"
      steps={[
        {
          label: '기본 정보',
          content: (
            <>
              <FormField label="이름">
                <Input placeholder="oncall-helper" />
              </FormField>
              <FormField label="에이전트 런타임">
                <Input value="claude (기본)" />
              </FormField>
            </>
          ),
        },
        {
          label: '도구 선택',
          content: (
            <FormField label="연결할 도구" hint="클릭해서 켜고 끕니다.">
              <div className="pl-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {['kubectl', 'promql', 'github', 'slack', 'runbook', 'loki'].map((t) => (
                  <button key={t} type="button" style={{ all: 'unset', cursor: 'pointer' }} onClick={() => toggle(t)}>
                    <Chip severity={tools.includes(t) ? 'info' : 'neutral'}>{t}</Chip>
                  </button>
                ))}
              </div>
            </FormField>
          ),
        },
      ]}
    />
  );
}

/* ── 6. PR 자동화 생성 위저드 ─────────── */
export function CreateAutomationWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="PR 자동화 생성"
      steps={[
        {
          label: '템플릿',
          content: (
            <>
              <FormField label="이름">
                <Input placeholder="node-scaler" />
              </FormField>
              <FormField label="대상 저장소">
                <Input value="Jungle-303-04/infra" />
              </FormField>
              <FormField label="템플릿 경로">
                <Input placeholder="templates/node-scale" />
              </FormField>
            </>
          ),
        },
        {
          label: '입력값 정의',
          content: (
            <>
              <FormField label="입력 변수" hint="사용자에게 물어볼 값들">
                <Input value="cluster, node_count" />
              </FormField>
              <FormField label="브랜치 프리픽스">
                <Input value="automation/" />
              </FormField>
            </>
          ),
        },
      ]}
    />
  );
}

/* ── 7. 단순 폼 모달들 ────────────────── */
export function SimpleCreateModal({
  open,
  onClose,
  title,
  fields,
  submitLabel = '생성',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: { label: string; placeholder?: string; hint?: string; password?: boolean }[];
  submitLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onClose}>
            {submitLabel}
          </Button>
        </>
      }
    >
      {fields.map((f) => (
        <FormField key={f.label} label={f.label} hint={f.hint}>
          <Input placeholder={f.placeholder} type={f.password ? 'password' : 'text'} />
        </FormField>
      ))}
    </Modal>
  );
}

/* ── 8. 업그레이드 PR 생성 ────────────── */
export function UpgradePrModal({ open, onClose, cluster }: { open: boolean; onClose: () => void; cluster: string }) {
  const [done, setDone] = useState(false);
  return (
    <Modal
      open={open}
      onClose={() => {
        setDone(false);
        onClose();
      }}
      title={`업그레이드 PR — ${cluster}`}
      actions={
        done ? (
          <Button
            variant="primary"
            onClick={() => {
              setDone(false);
              onClose();
            }}
          >
            확인
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>취소</Button>
            <Button variant="primary" onClick={() => setDone(true)}>
              PR 생성
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="pl-stack">
          <div className="pl-row">
            <PluralMarkIcon size={16} />
            <b>PR#129 생성됨</b>
          </div>
          <div className="pl-codeblock">Jungle-303-04/infra#129{'\n'}"{cluster} k8s v1.30 업그레이드"{'\n'}상태: 리뷰 대기</div>
          <p className="pl-muted" style={{ margin: 0 }}>
            셀프 서비스 → 대기 PR에서 확인할 수 있어요.
          </p>
        </div>
      ) : (
        <>
          <FormField label="목표 버전">
            <Input value="v1.30 (안전 경로)" />
          </FormField>
          <FormField label="전략">
            <Input value="서지 노드 1개, 웨이브 롤링" />
          </FormField>
        </>
      )}
    </Modal>
  );
}

/* ── 옵저버 생성/편집 위저드 (CD) ─────── */
export type ObserverDraft = {
  name: string;
  kind: 'helm' | 'oci' | 'git';
  target: string;
  interval: '1분' | '5분' | '30분' | '1시간';
  action: 'monitoring 자동 업데이트' | 'PR 생성' | '알림만';
};

const OBSERVER_KIND_HINTS: Record<ObserverDraft['kind'], string> = {
  helm: 'Helm 차트 저장소 — 예: logo-inc/console',
  oci: 'OCI 이미지 레지스트리 — 예: ghcr.io/jungle-303-04/cluster-agent',
  git: 'Git 저장소 태그 — 예: github.com/Jungle-303-04/final',
};

export function ObserverWizard({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: ObserverDraft;
  onClose: () => void;
  onSubmit: (d: ObserverDraft) => void;
}) {
  const [draft, setDraft] = useState<ObserverDraft>(
    initial ?? { name: '', kind: 'helm', target: '', interval: '5분', action: 'PR 생성' },
  );
  useEffect(() => {
    if (open) setDraft(initial ?? { name: '', kind: 'helm', target: '', interval: '5분', action: 'PR 생성' });
  }, [open, initial]);
  const set = <K extends keyof ObserverDraft>(k: K, v: ObserverDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title={initial ? `옵저버 편집 — ${initial.name}` : '옵저버 생성'}
      finishLabel={initial ? '저장' : '생성'}
      onFinish={() => onSubmit(draft)}
      steps={[
        {
          label: '감시 유형',
          content: (
            <>
              <FormField label="이름">
                <Input value={draft.name} onChange={(v) => set('name', v)} placeholder="my-watch" />
              </FormField>
              <FormField label="감시 대상 유형" hint={OBSERVER_KIND_HINTS[draft.kind]}>
                <TabList
                  tabs={[
                    { key: 'helm', label: 'Helm' },
                    { key: 'oci', label: 'OCI 이미지' },
                    { key: 'git', label: 'Git 태그' },
                  ]}
                  value={draft.kind}
                  onChange={(k) => set('kind', k as ObserverDraft['kind'])}
                />
              </FormField>
            </>
          ),
        },
        {
          label: '대상',
          content: (
            <FormField label="대상 주소" hint="새 버전이 감지되면 아래 트리거 액션이 실행됩니다.">
              <Input value={draft.target} onChange={(v) => set('target', v)} placeholder={OBSERVER_KIND_HINTS[draft.kind].split('예: ')[1]} />
            </FormField>
          ),
        },
        {
          label: '폴링 주기',
          content: (
            <FormField label="폴링 주기">
              <TabList
                tabs={(['1분', '5분', '30분', '1시간'] as const).map((i) => ({ key: i, label: i }))}
                value={draft.interval}
                onChange={(i) => set('interval', i as ObserverDraft['interval'])}
              />
            </FormField>
          ),
        },
        {
          label: '트리거 액션',
          content: (
            <FormField label="새 버전 감지 시" hint="PR 생성은 셀프 서비스 → PR 자동화의 템플릿을 사용합니다.">
              <TabList
                tabs={(['monitoring 자동 업데이트', 'PR 생성', '알림만'] as const).map((a) => ({ key: a, label: a }))}
                value={draft.action}
                onChange={(a) => set('action', a as ObserverDraft['action'])}
              />
            </FormField>
          ),
        },
      ]}
    />
  );
}

/* ── 파이프라인 생성/편집 위저드 (CD) ── */
export type PipelineDraft = {
  name: string;
  stages: string[];
  gate: '자동 승격' | '수동 승인';
  approver?: string;
};

export function PipelineWizard({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: PipelineDraft;
  onClose: () => void;
  onSubmit: (d: PipelineDraft) => void;
}) {
  const empty: PipelineDraft = { name: '', stages: ['dev', 'prod'], gate: '수동 승인', approver: '우녕' };
  const [draft, setDraft] = useState<PipelineDraft>(initial ?? empty);
  const [stageInput, setStageInput] = useState('');
  useEffect(() => {
    if (open) {
      setDraft(initial ?? empty);
      setStageInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title={initial ? `파이프라인 편집 — ${initial.name}` : '파이프라인 생성'}
      finishLabel={initial ? '저장' : '생성'}
      onFinish={() => onSubmit(draft)}
      steps={[
        {
          label: '기본',
          content: (
            <FormField label="파이프라인 이름" hint="서비스 리비전이 스테이지를 순서대로 통과합니다.">
              <Input value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="my-service-pipeline" />
            </FormField>
          ),
        },
        {
          label: '스테이지',
          content: (
            <>
              <div className="pl-row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                {draft.stages.map((s) => (
                  <Chip key={s}>
                    {s}{' '}
                    <button
                      type="button"
                      className="pl-caretbtn"
                      style={{ marginLeft: 4 }}
                      aria-label={`${s} 제거`}
                      onClick={() => setDraft((d) => ({ ...d, stages: d.stages.filter((x) => x !== s) }))}
                    >
                      ✕
                    </button>
                  </Chip>
                ))}
              </div>
              <div className="pl-row">
                <Input value={stageInput} onChange={setStageInput} placeholder="스테이지 이름 (예: staging)" />
                <Button
                  disabled={!stageInput.trim() || draft.stages.includes(stageInput.trim())}
                  onClick={() => {
                    setDraft((d) => ({ ...d, stages: [...d.stages, stageInput.trim()] }));
                    setStageInput('');
                  }}
                >
                  추가
                </Button>
              </div>
            </>
          ),
        },
        {
          label: '게이트',
          content: (
            <>
              <FormField label="스테이지 간 승격 방식">
                <TabList
                  tabs={(['자동 승격', '수동 승인'] as const).map((g) => ({ key: g, label: g }))}
                  value={draft.gate}
                  onChange={(g) => setDraft((d) => ({ ...d, gate: g as PipelineDraft['gate'] }))}
                />
              </FormField>
              {draft.gate === '수동 승인' && (
                <FormField label="승인자" hint="승인자만 다음 스테이지로 승격시킬 수 있어요.">
                  <Input value={draft.approver ?? ''} onChange={(v) => setDraft((d) => ({ ...d, approver: v }))} placeholder="사용자 또는 그룹" />
                </FormField>
              )}
            </>
          ),
        },
      ]}
    />
  );
}

/* ── 글로벌 서비스 생성/편집 모달 (CD) ── */
export type GlobalServiceDraft = {
  name: string;
  targetType: '전체 클러스터' | '태그 선택';
  tag?: string;
};

export function GlobalServiceModal({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: GlobalServiceDraft;
  onClose: () => void;
  onSubmit: (d: GlobalServiceDraft) => void;
}) {
  const empty: GlobalServiceDraft = { name: '', targetType: '전체 클러스터', tag: 'prod' };
  const [draft, setDraft] = useState<GlobalServiceDraft>(initial ?? empty);
  useEffect(() => {
    if (open) setDraft(initial ?? empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `글로벌 서비스 편집 — ${initial.name}` : '글로벌 서비스 생성'}
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={!draft.name.trim() || (draft.targetType === '태그 선택' && !draft.tag?.trim())}
            onClick={() => {
              onSubmit(draft);
              onClose();
            }}
          >
            {initial ? '저장' : '생성'}
          </Button>
        </>
      }
    >
      <FormField label="서비스 이름" hint="대상 클러스터 전체에 같은 서비스가 복제 배포됩니다.">
        <Input value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="cert-manager" />
      </FormField>
      <FormField label="배포 대상">
        <TabList
          tabs={(['전체 클러스터', '태그 선택'] as const).map((t) => ({ key: t, label: t }))}
          value={draft.targetType}
          onChange={(t) => setDraft((d) => ({ ...d, targetType: t as GlobalServiceDraft['targetType'] }))}
        />
      </FormField>
      {draft.targetType === '태그 선택' && (
        <FormField label="클러스터 태그">
          <Input value={draft.tag ?? ''} onChange={(v) => setDraft((d) => ({ ...d, tag: v }))} placeholder="prod" />
        </FormField>
      )}
    </Modal>
  );
}

/* ── Git 저장소 편집 (인증 갱신) 모달 ── */
export function EditRepoModal({
  open,
  url,
  onClose,
  onSubmit,
}: {
  open: boolean;
  url: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [auth, setAuth] = useState<'ssh' | 'https'>('https');
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="저장소 편집"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            onClick={() => {
              onSubmit();
              onClose();
            }}
          >
            저장
          </Button>
        </>
      }
    >
      <FormField label="저장소 URL" hint="URL은 변경할 수 없어요 — 다른 저장소는 새로 가져오세요.">
        <div className="pl-codeblock">{url}</div>
      </FormField>
      <FormField label="인증 방식">
        <TabList
          tabs={[
            { key: 'https', label: 'HTTPS 토큰' },
            { key: 'ssh', label: 'SSH 키' },
          ]}
          value={auth}
          onChange={setAuth}
        />
      </FormField>
      {auth === 'https' ? (
        <FormField label="새 액세스 토큰">
          <Input type="password" placeholder="ghp_..." />
        </FormField>
      ) : (
        <FormField label="새 SSH 개인 키">
          <Input type="password" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
        </FormField>
      )}
    </Modal>
  );
}
