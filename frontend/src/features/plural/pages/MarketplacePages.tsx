// Marketplace 그룹: 마켓플레이스 목록/필터 + repository 상세 탭
import { useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  DetailModal,
  EmptyState,
  FormField,
  IconFrame,
  Input,
  LinkTabList,
  Modal,
  PageHeader,
  SearchInput,
  Table,
} from '@/plural-ui';
import { DownloadIcon, PackageIcon, PluralMarkIcon } from '@/plural-ui/icons';
import { MARKETPLACE_APPS, MARKETPLACE_CATEGORIES, REPO_PACKAGES } from '../mock';

/* ── 마켓플레이스 목록 ────────────────── */
export function Marketplace({ installed = false }: { installed?: boolean }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');

  const apps = useMemo(
    () =>
      MARKETPLACE_APPS.filter(
        (a) =>
          (!installed || a.installed) &&
          (category === 'All' || a.category === category) &&
          a.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [q, category, installed],
  );

  return (
    <div className="pl-withsidenav">
      <nav className="pl-sidenav">
        <div className="pl-muted" style={{ padding: '8px 12px' }}>
          카테고리
        </div>
        {MARKETPLACE_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`pl-sidenav-item${category === c ? ' active' : ''}`}
            style={{ textAlign: 'left', background: category === c ? undefined : 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </nav>

      <div className="pl-sidenav-body">
        <PageHeader
          title={installed ? '설치됨' : '마켓플레이스'}
          sub={installed ? '이 계정에 설치된 애플리케이션' : '오픈소스 애플리케이션을 검색하고 설치하세요.'}
        />
        <div className="pl-toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="애플리케이션 검색" />
          <LinkTabList
            tabs={[
              { to: '/console/marketplace', label: '전체', end: true },
              { to: '/console/installed', label: '설치됨', end: true },
            ]}
          />
        </div>

        {apps.length === 0 ? (
          <EmptyState title="결과 없음" message="검색어나 카테고리를 바꿔보세요." />
        ) : (
          <div className="pl-grid-cards">
            {apps.map((a) => (
              <Link key={a.slug} to={`/console/marketplace/${a.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card>
                  <div className="pl-row pl-row--between">
                    <div className="pl-row">
                      <IconFrame size="lg">
                        <PackageIcon />
                      </IconFrame>
                      <div>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        <div className="pl-muted">{a.publisher}</div>
                      </div>
                    </div>
                    {a.installed && <Chip severity="success">설치됨</Chip>}
                  </div>
                  <p className="pl-sub" style={{ margin: '12px 0 8px' }}>
                    {a.description}
                  </p>
                  <div className="pl-row">
                    <Chip>{a.category}</Chip>
                    {a.trending && <Chip severity="info">인기</Chip>}
                    {a.releaseStatus !== 'GA' && <Chip severity="warning">{a.releaseStatus}</Chip>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 설치 모달 ────────────────────────── */
function InstallModal({ name, open, onClose }: { name: string; open: boolean; onClose: () => void }) {
  const [cluster, setCluster] = useState('클러스터01');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`설치 — ${name}`}
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onClose}>
            설치
          </Button>
        </>
      }
    >
      <FormField label="대상 클러스터">
        <Input value={cluster} onChange={setCluster} />
      </FormField>
      <FormField label="설치 명령" hint="CLI로 설치할 수도 있어요.">
        <div className="pl-codeblock">logo bundle install {name} {name}-aws</div>
      </FormField>
    </Modal>
  );
}

/* ── Repository 상세 ──────────────────── */
export function Repository() {
  const { name } = useParams();
  const app = MARKETPLACE_APPS.find((a) => a.slug === name);
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={
          <span className="pl-row">
            <IconFrame size="lg">
              <PackageIcon />
            </IconFrame>
            {app?.name ?? name}
          </span>
        }
        sub={app?.description}
        actions={
          app?.installed ? (
            <Chip severity="success">설치됨</Chip>
          ) : (
            <Button variant="primary" onClick={() => setInstallOpen(true)}>
              <DownloadIcon size={14} /> 설치
            </Button>
          )
        }
      />
      <InstallModal name={name ?? ''} open={installOpen} onClose={() => setInstallOpen(false)} />
      <LinkTabList
        tabs={[
          { to: `/console/marketplace/${name}`, label: '설명', end: true },
          { to: `/console/marketplace/${name}/packages`, label: '패키지' },
          { to: `/console/marketplace/${name}/tests`, label: '테스트' },
          { to: `/console/marketplace/${name}/deployments`, label: '배포' },
          { to: `/console/marketplace/${name}/artifacts`, label: '아티팩트' },
          { to: `/console/marketplace/${name}/edit`, label: '편집' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function RepositoryDescription() {
  const { name } = useParams();
  const app = MARKETPLACE_APPS.find((a) => a.slug === name);

  return (
    <Card>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--font-semi)', fontSize: 18 }}>{app?.name}</h2>
      <p className="pl-sub">{app?.description}</p>
      <div className="pl-codeblock">logo bundle install {name} {name}-aws</div>
    </Card>
  );
}

export function RepositoryPackages() {
  const { name } = useParams();
  return (
    <>
      <LinkTabList
        tabs={[
          { to: `/console/marketplace/${name}/packages/helm`, label: 'Helm' },
          { to: `/console/marketplace/${name}/packages/terraform`, label: 'Terraform' },
          { to: `/console/marketplace/${name}/packages/docker`, label: 'Docker' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function RepositoryPackageList({ type }: { type: 'helm' | 'terraform' | 'docker' }) {
  const rows = REPO_PACKAGES.filter((p) => p.type === type);
  const [selected, setSelected] = useState<(typeof REPO_PACKAGES)[number] | null>(null);
  if (rows.length === 0) return <EmptyState title={`${type} 패키지가 없습니다`} />;
  return (
    <>
      <Table headers={['이름', '버전', '업데이트', '']}>
        {rows.map((p) => (
          <tr key={p.name} className="clickable" onClick={() => setSelected(p)}>
            <td>
              <div className="pl-cell">
                <IconFrame size="md">
                  <PackageIcon />
                </IconFrame>
                {p.name}
              </div>
            </td>
            <td>
              <span className="pl-code">{p.version}</span>
            </td>
            <td>{p.updatedAt}</td>
            <td />
          </tr>
        ))}
      </Table>
      {selected && (
        <DetailModal
          title={`패키지 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '유형', value: <Chip>{selected.type}</Chip> },
            { label: '버전', value: <span className="pl-code">{selected.version}</span> },
            { label: '업데이트', value: selected.updatedAt },
            {
              label: '설치 명령',
              value: <span className="pl-code">plural {selected.type} install {selected.name}</span>,
            },
          ]}
        />
      )}
    </>
  );
}

export function RepositoryTests() {
  return (
    <Table headers={['테스트', '버전', '상태', '실행']}>
      {[
        { name: 'helm-lint', version: '0.5.21', status: '통과', at: '2일 전' },
        { name: 'integration-aws', version: '0.5.21', status: '통과', at: '2일 전' },
        { name: 'upgrade-path', version: '0.5.20 → 0.5.21', status: '통과', at: '2일 전' },
      ].map((t) => (
        <tr key={t.name}>
          <td style={{ fontWeight: 600 }}>{t.name}</td>
          <td>
            <span className="pl-code">{t.version}</span>
          </td>
          <td>
            <Chip severity="success">{t.status}</Chip>
          </td>
          <td>{t.at}</td>
        </tr>
      ))}
    </Table>
  );
}

export function RepositoryDeployments() {
  return (
    <Table headers={['버전', '클러스터', '상태', '시간']}>
      <tr>
        <td>
          <span className="pl-code">0.5.21</span>
        </td>
        <td>클러스터01</td>
        <td>
          <Chip severity="success">배포됨</Chip>
        </td>
        <td>2일 전</td>
      </tr>
    </Table>
  );
}

export function RepositoryArtifacts() {
  return (
    <Table headers={['아티팩트', '플랫폼', '크기', '']}>
      {[
        { name: 'cli-binary', platform: 'darwin/arm64', size: '24MB' },
        { name: 'cli-binary', platform: 'linux/amd64', size: '26MB' },
      ].map((a, i) => (
        <tr key={i}>
          <td style={{ fontWeight: 600 }}>{a.name}</td>
          <td>
            <span className="pl-code">{a.platform}</span>
          </td>
          <td>{a.size}</td>
          <td>
            <div className="pl-rowactions">
              <Button size="small">다운로드</Button>
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function RepositoryEdit() {
  return (
    <Card>
      <p className="pl-sub" style={{ margin: 0 }}>
        이 저장소를 편집할 권한이 없습니다. 퍼블리셔만 편집할 수 있어요.
      </p>
    </Card>
  );
}

/* ── Stack ────────────────────────────── */
export function Stack() {
  const { name } = useParams();
  const [installOpen, setInstallOpen] = useState(false);
  return (
    <>
      <PageHeader
        title={`${name} 스택`}
        sub="함께 설치되는 애플리케이션 묶음"
        actions={
          <Button variant="primary" onClick={() => setInstallOpen(true)}>
            스택 설치
          </Button>
        }
      />
      <InstallModal name={name ?? 'stack'} open={installOpen} onClose={() => setInstallOpen(false)} />
      <div className="pl-grid-cards">
        {MARKETPLACE_APPS.slice(0, 3).map((a) => (
          <Card key={a.slug}>
            <div className="pl-row">
              <IconFrame size="md">
                <PackageIcon />
              </IconFrame>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
            </div>
            <p className="pl-muted" style={{ marginTop: 8 }}>
              {a.description}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ── Publisher ────────────────────────── */
export function Publisher() {
  const { id } = useParams();
  return (
    <>
      <PageHeader
        title={
          <span className="pl-row">
            <IconFrame size="lg">
              <PluralMarkIcon size={20} />
            </IconFrame>
            {id ?? 'Plural'}
          </span>
        }
        sub="퍼블리셔가 배포한 애플리케이션"
      />
      <div className="pl-grid-cards">
        {MARKETPLACE_APPS.filter((a) => a.publisher === 'LOGO').map((a) => (
          <Link key={a.slug} to={`/console/marketplace/${a.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card>
              <div className="pl-row">
                <IconFrame size="md">
                  <PackageIcon />
                </IconFrame>
                <div style={{ fontWeight: 600 }}>{a.name}</div>
              </div>
              <p className="pl-muted" style={{ marginTop: 8 }}>
                {a.description}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
