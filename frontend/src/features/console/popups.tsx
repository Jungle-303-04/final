// Console 상세 팝업 모음 — 원본 콘솔의 플라이오버/상세 모달 패턴 재현
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Flyover, InfoList, InfoTip, Modal, TabList, Table } from '@/plural-ui';
import { useState } from 'react';
import { AwsIcon, PluralMarkIcon, SendIcon } from '@/plural-ui/icons';
import type { ConsoleCluster, K8sResource } from './api';
import { healthSeverity, statusSeverity } from './ui';

/* ── 0. 제네릭 상세 모달 (키-값 + 부가 콘텐츠) ── */
export function GenericDetailModal({
  title,
  rows,
  children,
  onClose,
}: {
  title: string;
  rows: { label: string; value: React.ReactNode }[];
  children?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={title} actions={<Button onClick={onClose}>닫기</Button>}>
      <div className="pl-stack">
        <InfoList rows={rows} />
        {children}
      </div>
    </Modal>
  );
}

/* ── 0-0. 삭제 가드 모달 (참조 무결성 — 기획서 I7) ──
 * 다른 리소스가 참조 중인 리소스는 삭제할 수 없다. 사유와 참조 목록을 보여준다.
 */
export function DeleteGuardModal({
  title,
  reason,
  refs,
  hint,
  onClose,
}: {
  title: string;
  reason: string;
  refs: string[];
  hint: string;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={title} actions={<Button onClick={onClose}>확인</Button>}>
      <div className="pl-stack" style={{ gap: 10 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>삭제할 수 없어요 — {reason}</p>
        <div className="pl-row" style={{ flexWrap: 'wrap' }}>
          {refs.map((r) => (
            <Chip key={r} severity="warning">
              {r}
            </Chip>
          ))}
        </div>
        <p className="pl-muted" style={{ margin: 0 }}>{hint}</p>
      </div>
    </Modal>
  );
}

/* ── 0-1. 접근 권한 바인딩 (리소스별 RBAC) ──
 * 개념: "누가 이 리소스를 볼 수(읽기)/바꿀 수(쓰기) 있는가".
 * 우선순위: 직접 바인딩 > 프로젝트 상속 > 전역 기본.
 * 상속된 바인딩은 회색으로 표시되고 여기서 제거할 수 없다(출처에서 관리).
 */
type Binding = { subject: string; kind: '사용자' | '그룹'; access: '읽기' | '쓰기' };
type InheritedBinding = Binding & { from: string };

/** 리소스마다 다른 직접 바인딩 (mock — 리소스 이름 기반) */
function directBindingsFor(resource: string): Binding[] {
  if (resource.includes('클러스터02')) return [{ subject: 'minmings', kind: '사용자', access: '쓰기' }];
  if (resource.includes('스택')) return [{ subject: 'sre', kind: '그룹', access: '쓰기' }];
  if (resource.includes('저장소')) return [{ subject: 'ci-deployer', kind: '사용자', access: '읽기' }];
  if (resource.includes('platform')) return [{ subject: 'sre', kind: '그룹', access: '쓰기' }];
  if (resource.includes('서비스')) return [];
  return [{ subject: 'developers', kind: '그룹', access: '쓰기' }];
}

function inheritedBindingsFor(resource: string): InheritedBinding[] {
  const project = resource.includes('platform') || resource.includes('mgmt') ? 'platform' : 'default';
  const rows: InheritedBinding[] = [{ subject: '우녕', kind: '사용자', access: '쓰기', from: '전역 기본' }];
  if (!resource.includes('전역'))
    rows.unshift(
      { subject: 'sre', kind: '그룹', access: '쓰기', from: `프로젝트 ${project}` },
      { subject: 'developers', kind: '그룹', access: '읽기', from: `프로젝트 ${project}` },
    );
  return rows;
}

function BindingRow({
  b,
  inherited,
  onRemove,
}: {
  b: Binding & { from?: string };
  inherited?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className={`pl-bindrow${inherited ? ' inherited' : ''}`}>
      <div className="pl-row">
        <div className="pl-avatar" style={{ width: 26, height: 26, fontSize: 12, background: inherited ? 'var(--color-fill-two)' : undefined }}>
          {b.subject[0].toUpperCase()}
        </div>
        <span style={{ fontWeight: 600 }}>{b.subject}</span>
        <Chip>{b.kind}</Chip>
      </div>
      <div className="pl-row">
        {b.from && <span className="pl-muted">{b.from}에서 상속</span>}
        <Chip severity={b.access === '쓰기' ? 'info' : 'neutral'}>{b.access}</Chip>
        {onRemove && (
          <button type="button" className="pl-caretbtn" title="제거" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/** 바인딩 편집기 — 모달과 페이지 양쪽에서 재사용 (진실은 한 곳) */
export function BindingsEditor({ resource }: { resource: string }) {
  const [direct, setDirect] = useState<Binding[]>(() => directBindingsFor(resource));
  const inherited = inheritedBindingsFor(resource);
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState<'사용자' | '그룹'>('그룹');
  const [access, setAccess] = useState<'읽기' | '쓰기'>('읽기');

  return (
    <div className="pl-stack">
      <div>
        <div className="pl-bindsection">이 리소스에 직접 부여됨</div>
        <div className="pl-stack" style={{ gap: 8 }}>
          {direct.length === 0 && (
            <p className="pl-muted" style={{ margin: '4px 0' }}>
              직접 바인딩 없음 — 아래 상속 규칙만 적용됩니다.
            </p>
          )}
          {direct.map((b, i) => (
            <BindingRow key={`${b.subject}-${i}`} b={b} onRemove={() => setDirect(direct.filter((_, j) => j !== i))} />
          ))}
        </div>
        <div className="pl-addrow">
          <select className="pl-input" value={kind} onChange={(e) => setKind(e.target.value as '사용자' | '그룹')}>
            <option value="그룹">그룹</option>
            <option value="사용자">사용자</option>
          </select>
          <input
            className="pl-input"
            placeholder={kind === '그룹' ? '그룹 이름 (예: developers)' : '사용자 이메일'}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <div className="pl-segment">
            {(['읽기', '쓰기'] as const).map((a) => (
              <button key={a} type="button" className={access === a ? 'on' : ''} onClick={() => setAccess(a)}>
                {a}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={!subject.trim()}
            onClick={() => {
              setDirect([...direct, { subject: subject.trim(), kind, access }]);
              setSubject('');
            }}
          >
            추가
          </Button>
        </div>
      </div>

      {inherited.length > 0 && (
        <div>
          <div className="pl-bindsection">
            상속됨 <span className="pl-muted" style={{ fontWeight: 400 }}>— 출처에서만 수정 가능</span>
          </div>
          <div className="pl-stack" style={{ gap: 8 }}>
            {inherited.map((b, i) => (
              <BindingRow key={`${b.subject}-${i}`} b={b} inherited />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PermissionsModal({ resource, onClose }: { resource: string; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      size="large"
      title={`접근 권한 — ${resource}`}
      actions={
        <>
          <Button onClick={onClose}>닫기</Button>
          <Button
            variant="primary"
            onClick={() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 1600);
            }}
          >
            {saved ? '저장됨 ✓' : '저장'}
          </Button>
        </>
      }
    >
      <div className="pl-row" style={{ margin: '0 0 16px' }}>
        <span className="pl-muted">이 리소스를 보고/바꿀 수 있는 대상</span>
        <InfoTip>
          적용 순서: 직접 바인딩 → 프로젝트 상속 → 전역 기본. 상속된 항목은 출처에서만 수정할 수
          있어요. 기능 권한(무엇을 할 수 있는가)은 설정 → 사용자 관리 → 역할에서 관리합니다.
        </InfoTip>
      </div>
      <BindingsEditor resource={resource} />
    </Modal>
  );
}

/* ── 1. 클러스터 플라이오버 (CD 클러스터 행 클릭) ── */
export function ClusterFlyover({
  cluster,
  onClose,
}: {
  cluster: ConsoleCluster | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!cluster) return null;
  return (
    <Flyover
      open
      onClose={onClose}
      title={
        <span className="pl-row">
          <PluralMarkIcon size={16} /> {cluster.name}
        </span>
      }
      actions={
        <>
          <Button onClick={() => navigate(`/console/kubernetes/${cluster.id}/deployments`)}>
            쿠버네티스 보기
          </Button>
          <Button variant="primary" onClick={() => navigate(`/console/cd/clusters/${cluster.id}`)}>
            클러스터 상세로 이동
          </Button>
        </>
      }
    >
      <div className="pl-stack">
        <div className="pl-row">
          <Chip severity={healthSeverity(cluster.health)}>건강 {cluster.health}</Chip>
          <Chip severity={statusSeverity(cluster.upgrade)}>{cluster.upgrade}</Chip>
        </div>
        <InfoList
          rows={[
            { label: '공급자', value: (
              <span className="pl-row" style={{ justifyContent: 'flex-end' }}>
                <AwsIcon size={18} /> {cluster.provider}
              </span>
            ) },
            { label: '프로젝트', value: <Chip>{cluster.id === 'mgmt' ? 'platform' : 'default'}</Chip> },
            { label: '리전', value: <span className="pl-code">{cluster.region}</span> },
            { label: '쿠버네티스 버전', value: <span className="pl-code">{cluster.version}</span> },
            { label: '노드', value: `${cluster.nodes}개` },
            { label: '팟', value: `${cluster.pods.toLocaleString()}개` },
            { label: '마지막 핑', value: cluster.pingedAt },
          ]}
        />
        {cluster.health < 50 && (
          <div className="pl-card" style={{ borderColor: 'var(--color-border-danger)' }}>
            <div style={{ fontWeight: 600, color: 'var(--color-text-danger)' }}>주의 필요</div>
            <p className="pl-muted" style={{ margin: '6px 0 0' }}>
              CrashLoopBackOff 팟과 NotReady 노드가 감지됐어요. 알림 탭에서 상세를 확인하세요.
            </p>
          </div>
        )}
      </div>
    </Flyover>
  );
}

/* ── 2. K8s 리소스 상세 모달 (정보/이벤트/YAML 탭) ── */
export function K8sResourceModal({
  resource,
  kind,
  onClose,
}: {
  resource: K8sResource | null;
  kind: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'info' | 'events' | 'yaml'>('info');
  const [applied, setApplied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scaling, setScaling] = useState(false);
  const [replicas, setReplicas] = useState('3');
  const scalable = ['deployments', 'replicasets', 'statefulsets'].includes(kind);
  if (!resource) return null;
  const bad = resource.status === 'CrashLoopBackOff';

  return (
    <Modal
      open
      onClose={onClose}
      size="large"
      title={`${kind} — ${resource.name}`}
      actions={
        <>
          {scalable && (
            <Button size="small" onClick={() => setScaling(true)}>
              스케일
            </Button>
          )}
          <Button size="small" destructive onClick={() => setDeleting(true)}>
            삭제
          </Button>
          {tab === 'yaml' && (
            <Button
              size="small"
              variant="primary"
              onClick={() => {
                setApplied(true);
                setTimeout(() => setApplied(false), 1600);
              }}
            >
              {applied ? '적용됨 ✓' : 'YAML 적용'}
            </Button>
          )}
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <TabList
        tabs={[
          { key: 'info', label: '정보' },
          { key: 'events', label: '이벤트' },
          { key: 'yaml', label: 'YAML' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'info' && (
        <InfoList
          rows={[
            { label: '이름', value: <span className="pl-code">{resource.name}</span> },
            { label: '네임스페이스', value: resource.namespace ?? '—' },
            { label: '상태', value: <Chip severity={statusSeverity(resource.status)}>{resource.status}</Chip> },
            { label: '준비', value: resource.ready ?? '—' },
            { label: '재시작', value: String(resource.restarts ?? 0) },
            { label: '나이', value: resource.age },
          ]}
        />
      )}
      {tab === 'events' && (
        <div className="pl-stack" style={{ gap: 8 }}>
          {bad ? (
            <>
              <div className="pl-row pl-row--between">
                <Chip severity="danger">OOMKilled</Chip>
                <span className="pl-muted">12분 전</span>
              </div>
              <div className="pl-row pl-row--between">
                <Chip severity="warning">BackOff — restarting failed container</Chip>
                <span className="pl-muted">10분 전</span>
              </div>
              <div className="pl-row pl-row--between">
                <Chip>Pulled — image already present</Chip>
                <span className="pl-muted">10분 전</span>
              </div>
            </>
          ) : (
            <>
              <div className="pl-row pl-row--between">
                <Chip severity="success">Scheduled — assigned to node</Chip>
                <span className="pl-muted">{resource.age} 전</span>
              </div>
              <div className="pl-row pl-row--between">
                <Chip severity="success">Started — container started</Chip>
                <span className="pl-muted">{resource.age} 전</span>
              </div>
            </>
          )}
        </div>
      )}
      {tab === 'yaml' && (
        <>
          <p className="pl-muted" style={{ margin: '0 0 8px' }}>
            직접 수정한 뒤 하단의 "YAML 적용"을 누르세요 (mock — kubectl apply와 동일한 흐름).
          </p>
          <textarea
            className="pl-codeblock"
            style={{ width: '100%', minHeight: 260, resize: 'vertical', color: 'var(--color-text-light)' }}
            defaultValue={`apiVersion: v1
kind: ${kind === 'pods' ? 'Pod' : kind}
metadata:
  name: ${resource.name}
  namespace: ${resource.namespace ?? 'default'}
  labels:
    app: ${resource.name.split('-').slice(0, 2).join('-')}
spec:
  containers:
    - name: main
      image: ghcr.io/jungle-303-04/${resource.name.split('-')[0]}:latest
      resources:
        limits:
          memory: ${bad ? '512Mi  # <- OOM 원인, PR#128에서 1Gi로 상향' : '1Gi'}
          cpu: 500m
status:
  phase: ${bad ? 'Running (CrashLoopBackOff)' : 'Running'}
  restartCount: ${resource.restarts ?? 0}`}
          />
        </>
      )}

      {/* 스케일 서브모달 */}
      {scaling && (
        <div className="pl-modal-overlay" style={{ zIndex: 110 }} onClick={() => setScaling(false)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pl-modal-head">
              <span className="pl-modal-title">스케일 — {resource.name}</span>
            </div>
            <div className="pl-modal-body">
              <label className="pl-field">
                <span className="pl-field-label">레플리카 수</span>
                <input className="pl-input" value={replicas} onChange={(e) => setReplicas(e.target.value)} />
              </label>
            </div>
            <div className="pl-modal-actions">
              <Button onClick={() => setScaling(false)}>취소</Button>
              <Button variant="primary" onClick={() => setScaling(false)}>
                {replicas}개로 스케일
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 서브모달 */}
      {deleting && (
        <div className="pl-modal-overlay" style={{ zIndex: 110 }} onClick={() => setDeleting(false)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pl-modal-head">
              <span className="pl-modal-title">리소스 삭제</span>
            </div>
            <div className="pl-modal-body">
              <span className="pl-code">{resource.name}</span> 을(를) 삭제할까요?{' '}
              {kind === 'pods' ? '컨트롤러가 있으면 팟이 다시 생성됩니다.' : '이 작업은 되돌릴 수 없어요.'}
            </div>
            <div className="pl-modal-actions">
              <Button onClick={() => setDeleting(false)}>취소</Button>
              <Button
                destructive
                onClick={() => {
                  setDeleting(false);
                  onClose();
                }}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── 3. 알림 AI 인사이트 모달 ── */
export type AlertLike = { name: string; severity: string; resource: string; firedAt: string };

export function AlertInsightModal({ alert, onClose }: { alert: AlertLike | null; onClose: () => void }) {
  if (!alert) return null;
  const crash = alert.name === 'PodCrashLooping';
  return (
    <Modal
      open
      onClose={onClose}
      title={`AI 인사이트 — ${alert.name}`}
      actions={
        <>
          <Button onClick={onClose}>닫기</Button>
          <Button variant="primary">
            <SendIcon size={13} /> AI 채팅으로 이어가기
          </Button>
        </>
      }
    >
      <div className="pl-stack">
        <InfoList
          rows={[
            { label: '심각도', value: <Chip severity={statusSeverity(alert.severity)}>{alert.severity}</Chip> },
            { label: '리소스', value: <span className="pl-code">{alert.resource}</span> },
            { label: '발생', value: alert.firedAt },
          ]}
        />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>AI 분석</div>
          {crash ? (
            <p style={{ margin: 0 }}>
              컨테이너가 메모리 리밋(512Mi)을 초과해 OOMKilled로 종료되고 있어요. 최근 배포(rev-9)에서 대시보드
              집계 배치 크기가 커진 것이 원인으로 보입니다. 리밋을 1Gi로 올리는 PR#128이 이미 생성되어 리뷰
              대기 중이에요.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              (mock 분석) 관련 메트릭과 이벤트를 종합하면 일시적 부하 증가로 판단돼요. 15분간 관찰 후 자동으로
              해제될 가능성이 높습니다.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── 4. AI 에이전트 실행 상세 모달 ── */
export type AgentRunLike = { id: string; prompt: string; status: string; startedAt: string };

export function AgentRunModal({ run, onClose }: { run: AgentRunLike | null; onClose: () => void }) {
  if (!run) return null;
  const done = run.status === '완료';
  return (
    <Modal
      open
      onClose={onClose}
      size="large"
      title={`에이전트 실행 — ${run.id}`}
      actions={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="pl-stack">
        <InfoList
          rows={[
            { label: '프롬프트', value: run.prompt },
            { label: '상태', value: <Chip severity={statusSeverity(run.status)}>{run.status}</Chip> },
            { label: '시작', value: run.startedAt },
          ]}
        />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>실행 단계</div>
          <div className="pl-row" style={{ flexWrap: 'wrap' }}>
            <Chip severity="success">1. 컨텍스트 수집</Chip>
            <Chip severity="success">2. 메트릭/로그 분석</Chip>
            <Chip severity={done ? 'success' : 'info'}>3. 조치안 생성</Chip>
            <Chip severity={done ? 'success' : 'neutral'}>4. PR 생성</Chip>
          </div>
        </div>
        <pre className="pl-codeblock" style={{ margin: 0 }}>
{done
  ? `[03:12:04] 팟 이벤트 수집: OOMKilled × 7
[03:12:11] 메모리 사용 추이 분석: 512Mi 리밋 초과 반복
[03:12:26] 조치안: resources.limits.memory 1Gi 상향
[03:12:38] PR#128 생성 완료 → 리뷰 대기`
  : `[--:--:--] 실행 중… 클러스터 상태를 수집하고 있어요.`}
        </pre>
      </div>
    </Modal>
  );
}

/* ── 5. 정책 상세 모달 ── */
export type PolicyLike = { name: string; severity: string; violations: number; description: string };

export function PolicyModal({ policy, onClose }: { policy: PolicyLike | null; onClose: () => void }) {
  if (!policy) return null;
  return (
    <Modal open onClose={onClose} title={`정책 — ${policy.name}`} actions={<Button onClick={onClose}>닫기</Button>}>
      <div className="pl-stack">
        <InfoList
          rows={[
            { label: '설명', value: policy.description },
            { label: '심각도', value: <Chip severity={policy.severity === '높음' ? 'danger' : 'warning'}>{policy.severity}</Chip> },
            { label: '위반', value: `${policy.violations}건` },
          ]}
        />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>영향받는 리소스</div>
          <Table headers={['리소스', '클러스터', '네임스페이스']}>
            {Array.from({ length: Math.min(policy.violations, 4) }, (_, i) => (
              <tr key={i}>
                <td>
                  <span className="pl-code">
                    {['dashboard-worker', 'legacy-batch', 'test-runner', 'debug-pod'][i]}
                  </span>
                </td>
                <td>{['클러스터02', '클러스터01', 'dev-us1-09', 'staging-us2-08'][i]}</td>
                <td>default</td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </Modal>
  );
}

/* ── 6. 취약점 상세 모달 ── */
export type VulnLike = { artifact: string; critical: number; high: number; medium: number; low: number };

export function VulnModal({ report, onClose }: { report: VulnLike | null; onClose: () => void }) {
  if (!report) return null;
  return (
    <Modal
      open
      onClose={onClose}
      size="large"
      title={`취약점 — ${report.artifact}`}
      actions={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="pl-stack">
        <div className="pl-row">
          {report.critical > 0 && <Chip severity="danger">Critical {report.critical}</Chip>}
          {report.high > 0 && <Chip severity="warning">High {report.high}</Chip>}
          <Chip>Medium {report.medium}</Chip>
          <Chip>Low {report.low}</Chip>
        </div>
        <Table headers={['CVE', '심각도', '패키지', '수정 버전']}>
          {report.critical > 0 && (
            <tr>
              <td>
                <span className="pl-code">CVE-2024-6387</span>
              </td>
              <td>
                <Chip severity="danger">Critical</Chip>
              </td>
              <td>
                <span className="pl-code">openssh-server 9.6p1</span>
              </td>
              <td>
                <span className="pl-code">9.8p1</span>
              </td>
            </tr>
          )}
          <tr>
            <td>
              <span className="pl-code">CVE-2023-44487</span>
            </td>
            <td>
              <Chip severity="warning">High</Chip>
            </td>
            <td>
              <span className="pl-code">nghttp2 1.55.1</span>
            </td>
            <td>
              <span className="pl-code">1.57.0</span>
            </td>
          </tr>
          <tr>
            <td>
              <span className="pl-code">CVE-2023-38545</span>
            </td>
            <td>
              <Chip severity="warning">High</Chip>
            </td>
            <td>
              <span className="pl-code">curl 8.3.0</span>
            </td>
            <td>
              <span className="pl-code">8.4.0</span>
            </td>
          </tr>
        </Table>
        <p className="pl-muted" style={{ margin: 0 }}>
          베이스 이미지를 최신으로 리빌드하면 대부분 해소돼요. PR 자동화(memory-limit-bump)와 함께 처리 가능.
        </p>
      </div>
    </Modal>
  );
}

/* ── 7. 비용 상세 모달 ── */
export type CostLike = { cluster: string; cpu: string; memory: string; storage: string; total: string };

export function CostModal({ row, onClose }: { row: CostLike | null; onClose: () => void }) {
  if (!row) return null;
  return (
    <Modal open onClose={onClose} title={`비용 상세 — ${row.cluster}`} actions={<Button onClick={onClose}>닫기</Button>}>
      <div className="pl-stack">
        <InfoList
          rows={[
            { label: 'CPU', value: row.cpu },
            { label: '메모리', value: row.memory },
            { label: '스토리지', value: row.storage },
            { label: '월 합계', value: <b>{row.total}</b> },
          ]}
        />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>네임스페이스별</div>
          <Table headers={['네임스페이스', '비중']}>
            <tr>
              <td>default</td>
              <td>68%</td>
            </tr>
            <tr>
              <td>infra</td>
              <td>24%</td>
            </tr>
            <tr>
              <td>kube-system</td>
              <td>8%</td>
            </tr>
          </Table>
        </div>
        <div className="pl-card">
          <div style={{ fontWeight: 600 }}>권장사항</div>
          <p className="pl-muted" style={{ margin: '6px 0 0' }}>
            spot 노드그룹 전환 시 약 60% 절감 예상. 유휴 시간대 오토스케일 다운 미설정.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/* ── 8. 파이프라인 상세 모달 ── */
export type PipelineLike = { name: string; stages: string[]; status: string };

export function PipelineModal({ pipeline, onClose }: { pipeline: PipelineLike | null; onClose: () => void }) {
  if (!pipeline) return null;
  const activeIdx = pipeline.status === '완료' ? pipeline.stages.length : pipeline.status === '대기' ? 0 : 1;
  return (
    <Modal open onClose={onClose} title={`파이프라인 — ${pipeline.name}`} actions={<Button onClick={onClose}>닫기</Button>}>
      <div className="pl-stack">
        <div className="pl-row">
          {pipeline.stages.map((s, i) => (
            <span key={s} className="pl-row" style={{ gap: 8 }}>
              {i > 0 && <span className="pl-muted">→</span>}
              <Chip severity={i < activeIdx ? 'success' : i === activeIdx ? 'info' : 'neutral'}>{s}</Chip>
            </span>
          ))}
        </div>
        <InfoList
          rows={[
            { label: '상태', value: <Chip severity={statusSeverity(pipeline.status)}>{pipeline.status}</Chip> },
            { label: '게이트', value: activeIdx < pipeline.stages.length ? `${pipeline.stages[activeIdx]} 승인 대기` : '모두 통과' },
            { label: '최근 트리거', value: 'PR#128 머지 감지' },
          ]}
        />
      </div>
    </Modal>
  );
}
