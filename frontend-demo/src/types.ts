import type { Edge, Node } from '@xyflow/react';

export type NodeStatus = 'idle' | 'running' | 'done' | 'blocked';
export type Accent = 'blue' | 'green' | 'purple' | 'amber' | 'slate' | 'rose';
export type ThemeMode = 'dark' | 'light';

export type NodeRow = {
  id: string;
  label: string;
  value?: string;
  tone?: Accent;
  unit?: string;
  detail?: string;
};

export type NodeField = {
  id: string;
  label: string;
  value: string;
  kind?: 'text' | 'number' | 'toggle' | 'textarea' | 'select';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{
    label: string;
    value: string;
  }>;
};

export type NodePort = {
  id: string;
  label: string;
  direction: 'input' | 'output';
  event: string;
  tone?: Accent;
  count?: number;
};

export type NodeBlock = {
  id: string;
  title: string;
  subtitle?: string;
  accent?: Accent;
  status?: NodeStatus;
  rows?: NodeRow[];
  fields?: NodeField[];
  ports?: NodePort[];
};

export type WorkflowNodeData = {
  accent: Accent;
  title: string;
  subtitle?: string;
  status: NodeStatus;
  rows: NodeRow[];
  fields?: NodeField[];
  blocks?: NodeBlock[];
  ports?: NodePort[];
  collapsed?: boolean;
  metric?: number;
  metricLabel?: string;
  metricUnit?: string;
  chartValues?: number[];
};

export type SignalEdgeData = {
  accent: Accent;
  status: NodeStatus;
  label?: string;
  event?: string;
  cadenceMs?: number;
};

export type WorkflowNode = Node<WorkflowNodeData>;
export type SignalEdge = Edge<SignalEdgeData>;

export type MetricPoint = {
  label: string;
  value: number;
};

export type RuntimeMetrics = {
  confidence: number;
  blastRadius: number;
  evidenceCount: number;
  pendingActions: number;
  latency: MetricPoint[];
  saturation: MetricPoint[];
  incidents: MetricPoint[];
};

export type RuntimeScalarMetric = 'confidence' | 'blastRadius' | 'evidenceCount' | 'pendingActions';

export type TimelineEvent = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: Accent;
};

export type FeaturePageId =
  | 'action-flow'
  | 'fleet'
  | 'deployments'
  | 'stacks'
  | 'services'
  | 'observability'
  | 'ai-ops'
  | 'access'
  | 'audit'
  | 'screen-catalog'
  | 'graph-lab'
  | 'animation-lab';

export type FeaturePage = {
  id: FeaturePageId;
  title: string;
  label: string;
  summary: string;
  accent: Accent;
  stats: Array<{
    label: string;
    value: string;
    delta: string;
  }>;
};

export type PipelineStep = {
  id: string;
  label: string;
  detail: string;
  state: 'complete' | 'active' | 'pending' | 'blocked';
};

export type ResourceTableRow = {
  id: string;
  cells: string[];
  stateCellIndex: number;
};

export type ResourceTable = {
  columns: string[];
  rows: ResourceTableRow[];
};

export type AgentStep = {
  id: string;
  label: string;
  value?: string;
  metric?: RuntimeScalarMetric;
  suffix?: string;
};

export type MotionSample = {
  id: string;
  label: string;
};

export type AccessMatrix = {
  columns: string[];
  rows: Array<{
    id: string;
    label: string;
    permissions: Array<'allowed' | 'denied'>;
  }>;
};

export type FeatureDemoContent = {
  orbitItems: string[];
  pipelineSteps: PipelineStep[];
  table: ResourceTable;
  agentSteps: AgentStep[];
  motionSamples: MotionSample[];
  accessMatrix: AccessMatrix;
  heatmapCells: number[];
};

export type RuntimeEventTemplate = {
  title: string;
  detail: string;
  tone: Accent;
};

export type RealtimeFrame = {
  load: number;
  health: number;
  throughput: number;
  risk: number;
  bars: number[];
  events: TimelineEvent[];
};

export type ScreenPreviewKind = 'overview' | 'table' | 'detail' | 'graph' | 'terminal' | 'form' | 'marketplace' | 'settings';

export type ScreenPreview = {
  id: string;
  group: string;
  title: string;
  description: string;
  kind: ScreenPreviewKind;
  accent: Accent;
  stats: Array<{ label: string; value: string }>;
  rows: Array<{ label: string; value: string; state?: string }>;
};

export type GraphModuleKind = 'stream' | 'radial' | 'heatmap' | 'stack' | 'network' | 'timeline';

export type GraphModule = {
  id: string;
  title: string;
  description: string;
  kind: GraphModuleKind;
  accent: Accent;
};

export type GraphNetworkNode = {
  id: string;
  label: string;
};

export type CopilotTool = {
  id: string;
  label: string;
  description: string;
  accent: Accent;
  selected: boolean;
};

export type CopilotMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  accent?: Accent;
};

export type CopilotAction = {
  id: string;
  title: string;
  detail: string;
  accent: Accent;
  value: string;
};

export type StudioNote = {
  id: string;
  title: string;
  body: string;
  accent: Accent;
  value: string;
};

export type ModuleContract = {
  id: string;
  title: string;
  purpose: string;
  input: string;
  output: string;
  metric: string;
  accent: Accent;
};
