import { useState } from 'react';
import {
  CheckIcon as IconCheck,
  FileTextIcon as IconFile,
  PlusIcon as IconPlus,
  Trash2Icon as IconTrash,
  TriangleAlertIcon as IconAlertTriangle,
} from 'lucide-react';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CodeBlock,
  ConfirmDialog,
  Drawer,
  Dropdown,
  EmptyState,
  Field,
  IconButton,
  Input,
  KeyValueList,
  MenuItem,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  StatusChip,
  Table,
  Tabs,
  Textarea,
  Tooltip,
  useToast,
} from '@/ui';

const rows = [
  { id: 'cluster-prod', name: 'production-apne2', status: 'healthy' as const, incidents: 0, owner: 'platform' },
  { id: 'cluster-ops', name: 'ops-control-plane', status: 'warning' as const, incidents: 2, owner: 'sre' },
  { id: 'cluster-lab', name: 'lab-sandbox', status: 'failed' as const, incidents: 5, owner: 'research' },
];

export default function UiShowcase() {
  const [tab, setTab] = useState('components');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="min-h-screen bg-bg p-8 text-text-primary">
      <PageHeader
        title="디자인 시스템"
        description="Tailwind semantic token과 Motion preset으로 구성한 콘솔 프리미티브 검수 화면"
        breadcrumb={<Breadcrumb items={[{ label: '개발' }, { label: 'UI' }]} />}
        actions={
          <>
            <Button variant="secondary" leadingIcon={<IconPlus size={16} />}>클러스터 등록</Button>
            <Button variant="primary" onClick={() => toast.push({ tone: 'success', title: '저장 완료', description: '변경 사항을 반영했습니다' })}>토스트 실행</Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'components', label: '컴포넌트', count: 18 },
          { value: 'states', label: '상태', count: 3 },
          { value: 'forms', label: '폼' },
        ]}
      />

      <div className="mt-6 grid gap-6">
        {tab === 'components' && (
          <>
            <div className="grid gap-4 lg:grid-cols-4">
              <StatCard label="정상 클러스터" value="18" delta="+3 지난 24시간" tone="success" />
              <StatCard label="열린 인시던트" value="7" delta="-2 감소" tone="warning" />
              <StatCard label="실행 워크플로우" value="12" delta="진행 중" tone="info" />
              <StatCard label="실패 배포" value="1" delta="조치 필요" tone="danger" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <Card
                title="클러스터 목록"
                description="고정 밀도 테이블, sticky header, 정렬, 행 hover"
                actions={<StatusChip status="running" />}
              >
                <Table
                  columns={[
                    { id: 'name', header: '이름', cell: row => <span className="font-medium text-text-primary">{row.name}</span>, sortValue: row => row.name, width: 'lg' },
                    { id: 'status', header: '상태', cell: row => <StatusChip status={row.status} />, sortValue: row => row.status },
                    { id: 'incidents', header: '인시던트', cell: row => row.incidents.toLocaleString(), sortValue: row => row.incidents, align: 'right' },
                    { id: 'owner', header: '소유', cell: row => row.owner },
                  ]}
                  rows={rows}
                  rowKey={row => row.id}
                />
              </Card>

              <Card title="액션">
                <div className="grid gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary">저장</Button>
                    <Button variant="secondary">동기화</Button>
                    <Button variant="ghost">취소</Button>
                    <Button variant="danger" leadingIcon={<IconTrash size={16} />}>삭제</Button>
                    <Button loading>처리 중</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Tooltip label="인시던트 상세로 이동">
                      <IconButton label="확인" icon={<IconCheck size={16} />} />
                    </Tooltip>
                    <Dropdown label="작업">
                      <MenuItem onSelect={() => setModalOpen(true)}>모달 열기</MenuItem>
                      <MenuItem onSelect={() => setDrawerOpen(true)}>드로어 열기</MenuItem>
                      <MenuItem tone="danger" onSelect={() => setConfirmOpen(true)}>삭제 확인</MenuItem>
                    </Dropdown>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="neutral">neutral</Badge>
                    <Badge tone="success">success</Badge>
                    <Badge tone="warning">warning</Badge>
                    <Badge tone="danger">danger</Badge>
                    <Badge tone="info">info</Badge>
                  </div>
                </div>
              </Card>
            </div>

            <Card title="코드 블록" description="쿼리와 YAML 복사용">
              <CodeBlock label="PromQL" code="sum(rate(container_cpu_usage_seconds_total{namespace='prod'}[5m])) by (pod)" />
            </Card>
          </>
        )}

        {tab === 'states' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="로딩">
              <Skeleton lines={5} />
            </Card>
            <Card title="빈 상태">
              <EmptyState icon={<IconFile size={18} />} title="저장된 위젯 없음" description="자주 보는 쿼리를 위젯으로 저장하세요" action={<Button size="sm">위젯 등록</Button>} />
            </Card>
            <Card title="오류">
              <EmptyState icon={<IconAlertTriangle size={18} />} title="조회 실패" description="네트워크 응답이 지연되고 있습니다" action={<Button size="sm">다시 시도</Button>} />
            </Card>
          </div>
        )}

        {tab === 'forms' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
            <Card title="클러스터 등록">
              <form className="grid gap-4">
                <Field label="클러스터 이름" help="운영자가 식별하는 한국어 명사형 이름을 사용합니다">
                  <Input placeholder="production-apne2" />
                </Field>
                <Field label="환경" error="환경을 선택해주세요">
                  <Select defaultValue="">
                    <option value="" disabled>선택</option>
                    <option value="production">production</option>
                    <option value="staging">staging</option>
                  </Select>
                </Field>
                <Field label="설명">
                  <Textarea placeholder="등록 목적과 담당 팀을 적어주세요" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost">취소</Button>
                  <Button variant="primary">검증</Button>
                </div>
              </form>
            </Card>
            <Card title="메타데이터">
              <KeyValueList
                items={[
                  { label: '워크스페이스', value: 'default' },
                  { label: '권한', value: <StatusChip status="healthy" label="관리 가능" /> },
                  { label: '마지막 배포', value: '2026-07-08 03:20 KST' },
                ]}
              />
            </Card>
          </div>
        )}
      </div>

      <Modal open={modalOpen} title="클러스터 등록" description="검증 후 대상 클러스터를 등록합니다" onOpenChange={setModalOpen}>
        <p className="text-body text-text-secondary">모달은 focus trap과 Escape 닫기를 포함합니다.</p>
      </Modal>
      <Drawer open={drawerOpen} title="인시던트 상세" description="증거 트레일과 후보 점수바를 담는 패널" onOpenChange={setDrawerOpen}>
        <div className="grid gap-4">
          <StatusChip status="critical" />
          <CodeBlock label="Evidence" code="kubectl describe pod checkout-api-7d9f" />
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirmOpen}
        title="복구 조치 삭제"
        description="삭제한 조치는 다시 실행할 수 없습니다"
        confirmLabel="삭제"
        onConfirm={() => {
          setConfirmOpen(false);
          toast.push({ tone: 'success', title: '삭제 완료' });
        }}
        onOpenChange={setConfirmOpen}
      />
    </div>
  );
}
