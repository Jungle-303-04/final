import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";

type WorkflowNode = Node<{ title: string; detail: string; status: string }, "workflow">;

const initialNodes: WorkflowNode[] = [
  createNode("input", "AI 입력", "현재 화면의 질문을 받습니다.", "대기", 0, 90),
  createNode("job", "작업 센터", "Git pull, test, push 진행률을 추적합니다.", "진행 중", 280, 90),
  createNode("log", "로그 드릴다운", "실패 단계의 로그를 단계별로 엽니다.", "검사 필요", 560, 90)
];

const initialEdges: Edge[] = [
  { id: "input-job", source: "input", target: "job", animated: true },
  { id: "job-log", source: "job", target: "log", animated: true }
];

const nodeTypes = {
  workflow: WorkflowCard
};

export default function ReactFlowWorkflowExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedId, setSelectedId] = useState(initialNodes[1].id);
  const colorMode = useDocumentTheme();

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) ?? nodes[0], [nodes, selectedId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge({ ...connection, animated: true }, current));
    },
    [setEdges]
  );

  function addNode() {
    const id = `review-${nodes.length + 1}`;
    setNodes((current) => [
      ...current,
      createNode(id, `검토 단계 ${current.length + 1}`, "새로 추가한 검토 노드입니다.", "신규", 140 + current.length * 70, 250)
    ]);
    setSelectedId(id);
  }

  return (
    <div className="flow-workbench">
      <div className="flow-toolbar">
        <button className="command-trigger stable-wide" data-stable-control="flow-add-node" onClick={addNode} type="button">
          노드 추가
        </button>
        <span>노드 {nodes.length}개 · 엣지 {edges.length}개</span>
      </div>

      <div className="flow-example interactive" data-testid="flow-workflow">
        <ReactFlow
          colorMode={colorMode}
          defaultEdgeOptions={{ animated: true }}
          deleteKeyCode={["Backspace", "Delete"]}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          nodeTypes={nodeTypes}
          nodes={nodes}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onNodesChange={onNodesChange}
          onNodesDelete={(deleted) => {
            if (deleted.some((node) => node.id === selectedId)) setSelectedId(nodes[0]?.id ?? "");
          }}
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
          <Panel className="flow-panel" position="top-left">
            <span>핸들을 끌어 새 연결을 만들 수 있습니다.</span>
          </Panel>
        </ReactFlow>
      </div>

      <aside className="flow-inspector" data-testid="flow-inspector">
        <strong>{selectedNode?.data.title ?? "선택 없음"}</strong>
        <span>{selectedNode?.data.detail ?? "노드를 선택하면 상세 정보가 표시됩니다."}</span>
        <em>{selectedNode?.data.status ?? "대기"}</em>
      </aside>
    </div>
  );
}

function WorkflowCard({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <div className={selected ? "flow-card selected" : "flow-card"}>
      <Handle aria-label={`${data.title} 입력 핸들`} type="target" position={Position.Left} />
      <strong>{data.title}</strong>
      <span>{data.detail}</span>
      <em>{data.status}</em>
      <Handle aria-label={`${data.title} 출력 핸들`} type="source" position={Position.Right} />
    </div>
  );
}

function createNode(id: string, title: string, detail: string, status: string, x: number, y: number): WorkflowNode {
  return {
    id,
    type: "workflow",
    position: { x, y },
    data: { title, detail, status }
  };
}

function useDocumentTheme(): "dark" | "light" {
  const readTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const [theme, setTheme] = useState<"dark" | "light">(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
