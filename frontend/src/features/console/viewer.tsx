// 뷰어 컨텍스트 — 유효 권한(기획서 I5·I6)의 단일 출처 + 역할 시뮬레이터
// 유효 권한 = 역할(기능 축) ∩ 접근 바인딩(리소스 축, 직접 > 프로젝트 > 전역)
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Button, Chip, Modal } from '@/plural-ui';
import { CLUSTERS, type ConsoleCluster } from './api';

/* ── 타입 ─────────────────────────────── */
export type ProjectId = 'default' | 'platform';
export type Access = 'none' | 'read' | 'write';
export type RoleId = 'admin' | 'sre' | 'developer' | 'newbie';

export type RolePreset = {
  id: RoleId;
  user: string;
  label: string;
  desc: string;
  groups: string[];
  /** 리소스 축 — 프로젝트별 유효 접근 (직접>프로젝트>전역이 계산된 결과) */
  access: Record<ProjectId, Access>;
  /** 스코프 생성 권한 */
  create: boolean;
  /** 기능 축(역할) — 관리 기능 */
  features: { userManagement: boolean; globalSettings: boolean };
};

export const ROLE_PRESETS: Record<RoleId, RolePreset> = {
  admin: {
    id: 'admin',
    user: '우녕',
    label: '관리자',
    desc: '모든 프로젝트 쓰기 + 사용자 관리·전역 설정',
    groups: ['admins'],
    access: { default: 'write', platform: 'write' },
    create: true,
    features: { userManagement: true, globalSettings: true },
  },
  sre: {
    id: 'sre',
    user: 'minmings',
    label: 'SRE',
    desc: '전 프로젝트 쓰기 — 관리 기능은 없음',
    groups: ['sre'],
    access: { default: 'write', platform: 'write' },
    create: true,
    features: { userManagement: false, globalSettings: false },
  },
  developer: {
    id: 'developer',
    user: 'jihoon',
    label: '개발자',
    desc: 'default 프로젝트 읽기 전용 — platform은 보이지 않음',
    groups: ['developers'],
    access: { default: 'read', platform: 'none' },
    create: false,
    features: { userManagement: false, globalSettings: false },
  },
  newbie: {
    id: 'newbie',
    user: 'newbie',
    label: '신규 입사자',
    desc: '아직 바인딩 없음 — 아무것도 보이지 않음',
    groups: [],
    access: { default: 'none', platform: 'none' },
    create: false,
    features: { userManagement: false, globalSettings: false },
  },
};

/* ── 프로젝트 매핑 (리소스 → 프로젝트) ── */
/** 클러스터의 소속 프로젝트: 관리 클러스터(mgmt)만 platform, 나머지는 default */
export function clusterProject(clusterIdOrName: string): ProjectId {
  return clusterIdOrName === 'mgmt' || clusterIdOrName === 'logo-mgmt' ? 'platform' : 'default';
}

/* ── 컨텍스트 ─────────────────────────── */
const STORAGE_KEY = 'console-viewer-role';

type ViewerCtx = {
  role: RolePreset;
  setRoleId: (id: RoleId) => void;
  /** admin이 아닌 시점으로 보는 중인가 */
  simulating: boolean;
};

const Ctx = createContext<ViewerCtx | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleIdState] = useState<RoleId>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && saved in ROLE_PRESETS ? (saved as RoleId) : 'admin';
  });
  const value = useMemo<ViewerCtx>(
    () => ({
      role: ROLE_PRESETS[roleId],
      setRoleId: (id: RoleId) => {
        localStorage.setItem(STORAGE_KEY, id);
        setRoleIdState(id);
      },
      simulating: roleId !== 'admin',
    }),
    [roleId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewer(): ViewerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('ViewerProvider 밖에서 useViewer를 호출했습니다');
  return v;
}

/* ── 유효 권한 훅 ─────────────────────── */
export type Permission = {
  canRead: boolean;
  canWrite: boolean;
  canCreate: boolean;
  /** 쓰기가 막힌 이유 (버튼 title 툴팁용) */
  writeReason?: string;
  createReason?: string;
};

export function usePermission(project: ProjectId): Permission {
  const { role } = useViewer();
  return useMemo(() => {
    const access = role.access[project];
    const canRead = access !== 'none';
    const canWrite = access === 'write';
    const canCreate = role.create && canWrite;
    return {
      canRead,
      canWrite,
      canCreate,
      writeReason: canWrite
        ? undefined
        : `쓰기 권한이 필요해요 — 프로젝트 ${project}의 관리자(sre 그룹)에게 요청하세요.`,
      createReason: canCreate ? undefined : '생성 권한이 필요해요 — 프로젝트 스코프에서 부여됩니다.',
    };
  }, [role, project]);
}

/* ── 가시 클러스터 (I6 — 모든 집계·히트맵·목록의 공통 기준) ── */
export function useVisibleClusters(): { clusters: ConsoleCluster[]; total: number } {
  const permDefault = usePermission('default');
  const permPlatform = usePermission('platform');
  return useMemo(
    () => ({
      clusters: CLUSTERS.filter((c) =>
        (clusterProject(c.id) === 'platform' ? permPlatform : permDefault).canRead,
      ),
      total: CLUSTERS.length,
    }),
    [permDefault, permPlatform],
  );
}

/* ── 가드 래퍼: 쓰기 버튼 비활성 + 사유 툴팁 (I5-②) ── */
export function Guard({
  allowed,
  reason,
  children,
}: {
  allowed: boolean;
  reason?: string;
  children: ReactNode;
}) {
  if (allowed) return <>{children}</>;
  return (
    <span title={reason} style={{ display: 'inline-flex', cursor: 'not-allowed' }}>
      <span style={{ pointerEvents: 'none', display: 'inline-flex', opacity: 0.45 }}>{children}</span>
    </span>
  );
}

/* ── 가시 범위 배지 (I6) ──────────────── */
export function VisibleBadge({ shown, total, unit }: { shown: number; total: number; unit: string }) {
  if (shown === total) return null;
  return (
    <Chip severity="neutral">
      접근 가능한 {shown}/{total}개 {unit} 표시 중
    </Chip>
  );
}

/* ── 역할 시뮬레이터 UI ───────────────── */
export function RoleSwitchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role, setRoleId } = useViewer();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="다른 역할로 보기"
      actions={<Button onClick={onClose}>닫기</Button>}
    >
      <p className="pl-muted" style={{ margin: '0 0 12px' }}>
        선택한 역할의 시점으로 콘솔 전체가 다시 그려집니다 — 권한에 따라 보이는 리소스와 가능한
        액션이 달라져요.
      </p>
      <div className="pl-stack" style={{ gap: 8 }}>
        {Object.values(ROLE_PRESETS).map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pl-sidenav-item${role.id === p.id ? ' active' : ''}`}
            style={{ textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%' }}
            onClick={() => {
              setRoleId(p.id);
              onClose();
            }}
          >
            <div className="pl-row pl-row--between">
              <span style={{ fontWeight: 600 }}>
                {p.label} <span className="pl-muted">({p.user})</span>
              </span>
              {role.id === p.id && <Chip severity="info">현재</Chip>}
            </div>
            <div className="pl-muted" style={{ fontSize: 12, marginTop: 2 }}>
              {p.desc}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ViewAsBanner() {
  const { role, setRoleId, simulating } = useViewer();
  if (!simulating) return null;
  return (
    <div className="co-viewas">
      <span>
        <strong>{role.label}({role.user})</strong> 시점으로 보는 중 — 권한에 따라 일부 리소스와
        액션이 제한됩니다.
      </span>
      <Button size="small" onClick={() => setRoleId('admin')}>
        원래대로
      </Button>
    </div>
  );
}
