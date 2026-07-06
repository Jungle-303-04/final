// Console 홈 대시보드: 플릿 맵(L0 드릴다운) + 위젯 보드 + 클러스터 테이블 + 최근 AI 스레드
import { useNavigate } from 'react-router-dom';
import { Button, Card, Chip, EmptyState, IconFrame, Table } from '@/plural-ui';
import { AwsIcon, CaretRightIcon, PluralMarkIcon, SendIcon } from '@/plural-ui/icons';
import { AI_THREADS } from '../api';
import { healthSeverity, statusSeverity } from '../ui';
import { useVisibleClusters, VisibleBadge } from '../viewer';
import { WidgetBoard } from '../widgets/WidgetBoard';

export function HomePage() {
  const navigate = useNavigate();
  // I6: 홈의 모든 숫자·차트는 뷰어의 가시 범위 기준으로 계산
  const { clusters: visibleAll, total: totalAll } = useVisibleClusters();
  const clusters = visibleAll;

  if (visibleAll.length === 0)
    return (
      <EmptyState
        title="아직 볼 수 있는 클러스터가 없어요"
        message="프로젝트 접근 바인딩이 부여되면 여기에 플릿 현황이 표시됩니다 — 관리자에게 요청하세요."
      />
    );

  return (
    <>
      <div className="pl-row" style={{ marginBottom: 12 }}>
        <VisibleBadge shown={visibleAll.length} total={totalAll} unit="클러스터" />
      </div>
      {/* 플릿 보드 — 맵(L0 드릴다운)도 위젯 프리셋으로 포함 (기획서 §4) */}
      <WidgetBoard scope={{ level: 'fleet' }} />
      <div className="pl-toolbar">
        <span style={{ fontWeight: 600 }}>클러스터</span>
        <Button variant="primary" onClick={() => navigate('/console/cd/clusters')}>
          CD로 이동
        </Button>
      </div>
      <Table headers={['클러스터', '공급자', '버전', '건강 점수', '업그레이드', '마지막 핑', '']}>
        {clusters.map((c) => (
          <tr key={c.id}>
            <td>
              <div className="pl-cell">
                <IconFrame size="md">
                  <PluralMarkIcon size={16} />
                </IconFrame>
                {c.name}
              </div>
            </td>
            <td>
              <div className="pl-cell">
                <IconFrame size="md">
                  <AwsIcon size={22} />
                </IconFrame>
                {c.provider}
              </div>
            </td>
            <td>
              <div className="pl-owner">
                <div className="name">
                  <span className="pl-code">{c.version}</span>
                </div>
                <div className="email">
                  {c.upgrade === '최신' ? '최신 상태' : <>목표: v1.32.4</>}
                </div>
              </div>
            </td>
            <td>
              <Chip severity={healthSeverity(c.health)}>{c.health >= 70 ? '건강함' : c.health >= 50 ? '보통' : '불량'} {c.health}</Chip>
            </td>
            <td>
              <Chip severity={statusSeverity(c.upgrade)}>{c.upgrade}</Chip>
            </td>
            <td>{c.pingedAt}</td>
            <td>
              <div className="pl-rowactions">
                <button
                  type="button"
                  className="pl-caretbtn"
                  aria-label="상세"
                  onClick={() => navigate(`/console/cd/clusters/${c.id}`)}
                >
                  <CaretRightIcon size={14} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {/* 최근 AI 스레드 */}
      <div style={{ marginTop: 16 }}>
      <Card className="pl-stack">
        <div className="pl-row pl-row--between">
          <span className="pl-row" style={{ fontWeight: 600 }}>
            <SendIcon size={14} /> 최근 AI 스레드
          </span>
          <Button size="small" onClick={() => navigate('/console/ai/threads')}>
            전체 보기
          </Button>
        </div>
        <div className="pl-stack" style={{ gap: 8 }}>
          {AI_THREADS.map((t) => (
            <div
              key={t.id}
              className="pl-bindrow"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/console/ai/threads')}
            >
              <div className="pl-row">
                <div className="pl-avatar" style={{ width: 26, height: 26, fontSize: 10, background: 'var(--color-fill-two)' }}>
                  AI
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{t.title}</div>
                  <div className="pl-muted">{t.lastMessage}</div>
                </div>
              </div>
              <span className="pl-muted" style={{ flex: 'none' }}>
                {t.updatedAt}
              </span>
            </div>
          ))}
        </div>
      </Card>
      </div>
    </>
  );
}
