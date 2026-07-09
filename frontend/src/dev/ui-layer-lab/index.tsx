import { useMemo, useState } from 'react';
import { Button, PageHeader, Tabs } from '@/ui';
import { AiCommandPaletteDemo } from './components/AiCommandPaletteDemo';
import { AiWorkspacePanelDemo } from './components/AiWorkspacePanelDemo';
import { ExecutionDrilldownDemo } from './components/ExecutionDrilldownDemo';
import { GlobalJobCenterDemo } from './components/GlobalJobCenterDemo';
import { PatternSourceGrid } from './components/PatternSourceGrid';
import { ReactFlowReferenceDemo } from './components/ReactFlowReferenceDemo';
import { modules } from './data';

const tabItems = [
  { value: 'inventory', label: 'Inventory' },
  ...modules.map((module) => ({ value: module.id, label: module.title })),
];

export default function UiLayerLabPage() {
  const [tab, setTab] = useState('inventory');
  const currentModule = useMemo(() => modules.find((item) => item.id === tab), [tab]);
  return (
    <div className="grid min-w-0 gap-6 overflow-hidden">
      <PageHeader
        title="UI Layer Reference Lab"
        description="AI 오버레이, 전역 작업 상태, 실행 로그 드릴다운, React Flow 캔버스를 로컬에서 바로 뜯어볼 수 있게 분리한 샘플입니다."
        actions={
          <a href="/dev/ui" className="inline-flex">
            <Button size="sm">기존 UI 쇼케이스</Button>
          </a>
        }
      />

      <div className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface p-3 shadow-soft">
        <Tabs items={tabItems} value={tab} onValueChange={setTab} />
      </div>

      {tab === 'inventory' && <PatternSourceGrid />}
      {currentModule?.id === 'command' && <AiCommandPaletteDemo />}
      {currentModule?.id === 'assistant' && <AiWorkspacePanelDemo />}
      {currentModule?.id === 'jobs' && <GlobalJobCenterDemo />}
      {currentModule?.id === 'drilldown' && <ExecutionDrilldownDemo />}
      {currentModule?.id === 'reactflow' && <ReactFlowReferenceDemo />}
    </div>
  );
}
