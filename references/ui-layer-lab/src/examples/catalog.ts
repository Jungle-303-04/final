import type { CategoryDefinition, ExampleCatalogEntry, VariantGroup } from "./types";

export const categories: CategoryDefinition[] = [
  {
    id: "overlay-command",
    label: "오버레이/명령",
    purpose: "현재 화면을 떠나지 않고 명령을 찾고, 확인하고, 실행합니다.",
    whenToUse: "전역 단축키, 빠른 검색, 위험 명령 확인, 상단 레이어 입력이 필요할 때"
  },
  {
    id: "ai-layer",
    label: "AI 작업 레이어",
    purpose: "AI 입력, 스트리밍 응답, 도구 승인, 근거 확인을 제품 화면 위에 자연스럽게 얹습니다.",
    whenToUse: "AI 채팅이 화면 이동 없이 현재 컨텍스트를 읽고 행동해야 할 때"
  },
  {
    id: "job-logs",
    label: "작업 진행/로그",
    purpose: "Git pull, test, push 같은 백그라운드 작업의 현재 위치와 실패 원인을 보여줍니다.",
    whenToUse: "사용자가 기다리는 작업의 시작, 진행, 실패, 재시도, 로그 tail을 이해해야 할 때"
  },
  {
    id: "drilldown-nav",
    label: "드릴다운 탐색",
    purpose: "workflow > job > step > log처럼 깊어지는 정보를 위치 감각을 잃지 않고 탐색합니다.",
    whenToUse: "계층형 로그, 리소스, 이벤트, 테이블 상세를 빠르게 좁혀야 할 때"
  },
  {
    id: "flow-builder",
    label: "플로우 빌더",
    purpose: "노드, 엣지, 상태, inspector를 통해 작업 흐름을 시각적으로 편집합니다.",
    whenToUse: "AI workflow, 배포 pipeline, 로그 처리 그래프를 조작해야 할 때"
  },
  {
    id: "data-viz",
    label: "데이터 시각화",
    purpose: "상태 색상, 값 기반 면적, 차트 전환, 히트맵 드릴다운을 하나의 분석 화면으로 구성합니다.",
    whenToUse: "용량, 오류율, 트래픽, 실행 상태를 한눈에 비교해야 할 때"
  },
  {
    id: "motion",
    label: "모션/상태 전환",
    purpose: "화면 전환이 왜 일어났는지 사용자가 이해하도록 움직임을 설계합니다.",
    whenToUse: "drawer, skeleton, reorder, progress, enter/exit가 정보 이해를 도와야 할 때"
  },
  {
    id: "primitives",
    label: "기본 컴포넌트",
    purpose: "버튼, 탭, 아코디언, 대화상자, 스켈레톤 같은 기본 조각을 안정적으로 재사용합니다.",
    whenToUse: "제품 전반에 반복되는 컨트롤과 상태 표현을 통일해야 할 때"
  }
];

const primaryExamples: ExampleCatalogEntry[] = [
  {
    id: "command-basic",
    file: "01-command-basic.example.tsx",
    category: "overlay-command",
    title: "명령 팔레트",
    description: "검색, 페이지 이동, 선택 미리보기를 한 화면에 통합한 명령 메뉴입니다.",
    motionIntent: "열림/닫힘은 overlay enter, 검색 결과 교체는 list reveal, 선택 미리보기는 panel swap으로 의도를 드러냅니다.",
    variantIds: ["command-shortcuts", "command-groups", "command-async-results", "command-recent-actions", "command-quick-create"]
  },
  {
    id: "component-dialog-command-preview",
    file: "481-component-dialog-command-preview.example.tsx",
    category: "overlay-command",
    title: "명령 실행 확인",
    description: "위험하거나 영향 범위가 있는 명령은 실행 전 대상과 변경 범위를 확인합니다.",
    motionIntent: "대화상자는 backdrop fade와 panel enter로 top layer를 명확히 분리합니다.",
    variantIds: ["command-confirm-stage-panel", "command-confirm-danger", "component-alert-dialog-danger-run"]
  },
  {
    id: "ai-quick-input",
    file: "02-ai-quick-input.example.tsx",
    category: "ai-layer",
    title: "AI 빠른 입력",
    description: "현재 화면 위에서 질문하고, 답변과 컨텍스트를 같은 공간에서 확인합니다.",
    motionIntent: "입력창은 하단에서 떠오르고 답변은 같은 높이의 슬롯 안에서 교체됩니다.",
    variantIds: ["ai-overlay-inline-composer-dock", "ai-floating-copilot", "ai-model-picker-chat"]
  },
  {
    id: "ai-tool-call",
    file: "34-ai-tool-call.example.tsx",
    category: "ai-layer",
    title: "AI 도구 승인",
    description: "AI가 로그 조회나 파일 변경 같은 도구를 실행하기 전에 사용자 승인을 받습니다.",
    motionIntent: "승인 결과는 기존 카드 안에서 reveal되어 대화 맥락을 밀어내지 않습니다.",
    variantIds: ["ai-tool-result-card", "ai-tool-output-expand-collapse", "ai-tool-permission-review"]
  },
  {
    id: "job-progress-strip",
    file: "04-job-progress-strip.example.tsx",
    category: "job-logs",
    title: "Git 작업 진행",
    description: "Git pull부터 검사까지 이어지는 작업 진행률과 현재 단계를 고정된 영역에 표시합니다.",
    motionIntent: "progress fill과 단계 label만 전환되어 주변 레이아웃은 움직이지 않습니다.",
    variantIds: ["job-git-sync-runner", "job-git-operation-stack", "job-progress-milestone-map"]
  },
  {
    id: "job-log-drawer",
    file: "05-job-log-drawer.example.tsx",
    category: "job-logs",
    title: "작업 로그 드로어",
    description: "진행 중인 작업의 상세 로그를 preview frame 내부 드로어로 열어 확인합니다.",
    motionIntent: "드로어는 frame 내부에서만 slide되고 로그 tail은 고정 높이 안에서 갱신됩니다.",
    variantIds: ["job-live-tail", "job-log-window-follow", "job-step-output-split"]
  },
  {
    id: "workflow-drilldown",
    file: "06-workflow-drilldown.example.tsx",
    category: "drilldown-nav",
    title: "워크플로 드릴다운",
    description: "workflow, job, step, log를 단계적으로 좁혀 실패 원인을 찾습니다.",
    motionIntent: "단계 이동은 같은 grid slot 안에서 detail panel만 교체해 방향성을 유지합니다.",
    variantIds: ["job-github-actions-log-drilldown", "drilldown-workflow-job-step-log", "timeline-drilldown"]
  },
  {
    id: "resource-drilldown",
    file: "07-resource-drilldown.example.tsx",
    category: "drilldown-nav",
    title: "리소스 드릴다운",
    description: "클러스터, 네임스페이스, 워크로드, 파드를 순서대로 탐색합니다.",
    motionIntent: "선택된 계층만 강조하고 detail 영역 높이는 고정해 탐색 중 흔들림을 줄입니다.",
    variantIds: ["tree-drilldown", "drilldown-column-browser", "drilldown-json-inspector"]
  },
  {
    id: "react-flow-workflow",
    file: "10-react-flow-workflow.example.tsx",
    category: "flow-builder",
    title: "React Flow 워크플로",
    description: "AI 입력, 작업 센터, 로그 분석을 노드와 엣지로 연결합니다.",
    motionIntent: "작업 진행 엣지는 움직이되 reduced motion에서는 정적 stroke로 의미를 유지합니다.",
    variantIds: ["react-flow-subflow", "react-flow-minimap", "react-flow-edge-label", "react-flow-node-toolbar"]
  },
  {
    id: "react-flow-inspector",
    file: "44-react-flow-inspector.example.tsx",
    category: "flow-builder",
    title: "노드 Inspector",
    description: "노드를 선택하면 우측 패널이 해당 노드의 로그와 액션을 보여줍니다.",
    motionIntent: "선택 변경 시 inspector 내용만 교체되어 그래프 viewport는 안정적으로 유지됩니다.",
    variantIds: ["react-flow-node-data-table-sync", "react-flow-selection-summary", "react-flow-validation"]
  },
  {
    id: "heatmap-cluster-treemap",
    file: "09-heatmap-cluster-treemap.example.tsx",
    category: "data-viz",
    title: "클러스터 트리맵 히트맵",
    description: "용량, 오류율, 트래픽 값으로 면적을 재계산하고 상태는 색상으로 표현합니다.",
    motionIntent: "모드 전환은 tile size와 위치 변화로 데이터 기준이 바뀌었음을 보여줍니다.",
    variantIds: ["heatmap-lens-detail", "heatmap-legend", "heatmap-threshold-filter", "heatmap-brush"]
  },
  {
    id: "chart-area-interactive",
    file: "478-chart-area-interactive.example.tsx",
    category: "data-viz",
    title: "인터랙티브 차트 카드",
    description: "같은 차트 카드에서 지표를 전환하고 합계를 함께 확인합니다.",
    motionIntent: "지표 버튼은 크기를 유지하고 차트 stroke/fill만 전환합니다.",
    variantIds: ["chart-area-default", "chart-area-stacked", "chart-bar-run-status", "chart-tooltip-comparison"]
  },
  {
    id: "animated-drawer-snap-points",
    file: "365-animated-drawer-snap-points.example.tsx",
    category: "motion",
    title: "하단 드로어 스냅 포인트",
    description: "같은 preview frame 안에서 요약, 절반, 전체 보기 밀도를 전환합니다.",
    motionIntent: "드로어 높이만 safe area 안에서 바뀌고 제목과 컨트롤은 절대 가리지 않습니다.",
    variantIds: ["animated-sidebar-peek", "animated-resize-panel", "animated-modal-focus-trap"]
  },
  {
    id: "animated-priority-reorder-list",
    file: "433-animated-priority-reorder-list.example.tsx",
    category: "motion",
    title: "우선순위 재정렬",
    description: "작업을 맨 위로 올리며 list reorder 상태를 확인합니다.",
    motionIntent: "row order는 DOM과 시각 순서가 함께 바뀌고 버튼 크기는 유지됩니다.",
    variantIds: ["animated-sortable-list", "animated-reorder-grid", "animated-queue-reorder"]
  },
  {
    id: "component-skeleton-loading-state",
    file: "488-component-skeleton-loading-state.example.tsx",
    category: "primitives",
    title: "스켈레톤 로딩 상태",
    description: "데이터가 들어오기 전과 후에도 같은 카드 높이와 슬롯을 유지합니다.",
    motionIntent: "outer shell은 고정하고 내부 skeleton/result layer만 crossfade합니다.",
    variantIds: ["shimmer-skeleton", "animated-skeleton-to-content", "animated-command-search-skeleton"]
  },
  {
    id: "component-tabs-result-summary",
    file: "485-component-tabs-result-summary.example.tsx",
    category: "primitives",
    title: "결과 요약 탭",
    description: "성공, 실패, 건너뜀 결과를 같은 panel 안에서 전환합니다.",
    motionIntent: "탭 버튼 크기는 고정하고 active 상태는 배경/indicator로만 표현합니다.",
    variantIds: ["animated-tabs", "animated-shared-indicator", "component-accordion-log-stages"]
  }
];

const supplementalExamples: ExampleCatalogEntry[] = [
  {
    id: "command-shortcuts",
    file: "12-command-shortcuts.example.tsx",
    category: "overlay-command",
    title: "단축키 명령 팔레트",
    description: "자주 쓰는 명령을 키보드 중심으로 찾고 실행하는 메뉴입니다.",
    motionIntent: "단축키 안내는 행 높이를 유지한 채 보조 텍스트로만 드러나 버튼 크기가 흔들리지 않습니다.",
    variantIds: ["command-hotkey-recorder", "command-shortcut-cheatsheet"]
  },
  {
    id: "command-groups",
    file: "13-command-groups.example.tsx",
    category: "overlay-command",
    title: "그룹형 명령 검색",
    description: "페이지, 작업, 도구 명령을 그룹으로 나눠 긴 목록에서도 위치를 잃지 않게 합니다.",
    motionIntent: "검색 결과는 그룹 경계와 행 opacity만 전환해 스캔 흐름을 유지합니다.",
    variantIds: ["command-separated-action-groups", "command-collapsible-groups"]
  },
  {
    id: "command-async-results",
    file: "24-command-async-results.example.tsx",
    category: "overlay-command",
    title: "비동기 명령 결과",
    description: "원격 검색 중에도 command shell 높이를 유지하며 결과를 교체합니다.",
    motionIntent: "로딩과 결과는 같은 슬롯에서 crossfade되어 검색 중 레이아웃 점프를 막습니다.",
    variantIds: ["animated-command-search-skeleton", "command-inline-progress"]
  },
  {
    id: "command-recent-actions",
    file: "70-command-recent-actions.example.tsx",
    category: "overlay-command",
    title: "최근 명령 재실행",
    description: "직전 작업과 자주 쓰는 명령을 빠르게 다시 실행합니다.",
    motionIntent: "최근 항목은 고정된 행 크기 안에서 active 상태만 전환합니다.",
    variantIds: ["command-query-history", "command-history-stack"]
  },
  {
    id: "ai-streaming-message",
    file: "33-ai-streaming-message.example.tsx",
    category: "ai-layer",
    title: "AI 스트리밍 응답",
    description: "AI 답변이 들어오는 과정을 현재 화면 위에서 단계적으로 보여줍니다.",
    motionIntent: "토큰 스트림은 같은 말풍선 안에서 증가해 주변 패널을 밀지 않습니다.",
    variantIds: ["ai-tool-stream-timeline", "ai-reasoning-progress"]
  },
  {
    id: "ai-citations",
    file: "55-ai-citations.example.tsx",
    category: "ai-layer",
    title: "AI 근거 인용",
    description: "AI 응답 옆에 근거 파일과 로그 출처를 함께 표시합니다.",
    motionIntent: "근거 선택은 side panel 내용만 교체해 대화 맥락을 유지합니다.",
    variantIds: ["ai-inline-citation-popover", "ai-citation-filter"]
  },
  {
    id: "ai-agent-steps",
    file: "79-ai-agent-steps.example.tsx",
    category: "ai-layer",
    title: "AI 에이전트 단계",
    description: "계획, 도구 실행, 검증, 완료 단계를 사용자가 추적할 수 있게 합니다.",
    motionIntent: "단계 진행은 checklist indicator만 채워져 사용자가 현재 위치를 바로 읽습니다.",
    variantIds: ["ai-agent-step-editor", "ai-plan-execute-switch"]
  },
  {
    id: "ai-model-picker-chat",
    file: "186-ai-model-picker-chat.example.tsx",
    category: "ai-layer",
    title: "AI 모델 선택 대화",
    description: "질문 성격에 따라 모델과 응답 방식을 바꾸는 채팅 레이어입니다.",
    motionIntent: "모델 전환은 composer 크기를 고정하고 badge와 상태 문구만 바꿉니다.",
    variantIds: ["ai-model-fallback-route", "ai-model-router-lanes"]
  },
  {
    id: "job-queue",
    file: "28-job-queue.example.tsx",
    category: "job-logs",
    title: "작업 대기열",
    description: "대기, 실행, 완료 작업을 한 화면에서 비교합니다.",
    motionIntent: "상태 이동은 row highlight와 progress badge로만 표현해 리스트 높이를 유지합니다.",
    variantIds: ["job-priority-queue", "job-runner-queue-slot"]
  },
  {
    id: "job-live-tail",
    file: "82-job-live-tail.example.tsx",
    category: "job-logs",
    title: "실시간 로그 Tail",
    description: "긴 작업 중 새 로그가 들어오는 흐름을 하단 고정 창에서 확인합니다.",
    motionIntent: "새 로그는 terminal window 안에서만 append되어 페이지 전체가 흔들리지 않습니다.",
    variantIds: ["job-log-window-follow", "job-terminal-runner"]
  },
  {
    id: "job-git-sync-runner",
    file: "191-job-git-sync-runner.example.tsx",
    category: "job-logs",
    title: "Git 동기화 실행",
    description: "pull, test, push 같은 git 작업 단계를 연속 실행으로 보여줍니다.",
    motionIntent: "현재 단계만 emphasis되고 완료 단계는 고정된 checklist 안에서 누적됩니다.",
    variantIds: ["job-git-operation-stack", "job-git-pull-push-timeline"]
  },
  {
    id: "job-cancellable-pipeline",
    file: "341-job-cancellable-pipeline.example.tsx",
    category: "job-logs",
    title: "취소 가능한 파이프라인",
    description: "실행 중인 작업을 중단하고 사용자에게 취소 상태를 명확히 보여줍니다.",
    motionIntent: "취소 상태는 같은 card shell 안에서 severity와 label만 바뀝니다.",
    variantIds: ["job-cancel-action", "job-cancel-reason-picker"]
  },
  {
    id: "stepper-drilldown",
    file: "29-stepper-drilldown.example.tsx",
    category: "drilldown-nav",
    title: "단계형 드릴다운",
    description: "상위 선택에서 하위 상세로 내려가는 흐름을 단계 indicator와 함께 보여줍니다.",
    motionIntent: "단계 전환은 같은 column 안에서 강조선만 이동합니다.",
    variantIds: ["drilldown-breadcrumb-history", "drilldown-nested-json-path"]
  },
  {
    id: "timeline-drilldown",
    file: "39-timeline-drilldown.example.tsx",
    category: "drilldown-nav",
    title: "타임라인 드릴다운",
    description: "작업 이벤트를 시간 순으로 따라가며 원인 구간을 좁힙니다.",
    motionIntent: "타임라인 선택은 detail panel만 교체하고 시간 축은 고정합니다.",
    variantIds: ["job-rollback-timeline", "job-run-timeline-slider"]
  },
  {
    id: "table-drilldown",
    file: "40-table-drilldown.example.tsx",
    category: "drilldown-nav",
    title: "테이블 행 드릴다운",
    description: "테이블에서 행을 선택하면 같은 화면 안에서 상세와 액션을 확인합니다.",
    motionIntent: "행 선택은 테이블 크기를 유지하고 우측/하단 상세만 전환합니다.",
    variantIds: ["component-table-row-actions", "drilldown-table-column-lens"]
  },
  {
    id: "drilldown-json-inspector",
    file: "194-drilldown-json-inspector.example.tsx",
    category: "drilldown-nav",
    title: "JSON 경로 Inspector",
    description: "중첩 로그와 응답 데이터를 경로 단위로 탐색합니다.",
    motionIntent: "path focus만 이동해 깊은 구조에서도 시각적 기준점을 잃지 않습니다.",
    variantIds: ["drilldown-nested-json-path", "drilldown-error-boundary-tree"]
  },
  {
    id: "react-flow-subflow",
    file: "11-react-flow-subflow.example.tsx",
    category: "flow-builder",
    title: "서브플로우 그룹",
    description: "관련 노드를 하나의 흐름 묶음으로 읽고 편집합니다.",
    motionIntent: "그룹 경계는 viewport를 유지한 채 내부 관계를 강조합니다.",
    variantIds: ["react-flow-expand-collapse", "react-flow-selection-group"]
  },
  {
    id: "react-flow-minimap",
    file: "30-react-flow-minimap.example.tsx",
    category: "flow-builder",
    title: "미니맵 플로우",
    description: "큰 그래프에서 현재 위치와 전체 구조를 동시에 확인합니다.",
    motionIntent: "pan/zoom은 canvas 내부에서만 일어나고 주변 UI는 고정됩니다.",
    variantIds: ["react-flow-minimap-style-switch", "react-flow-viewport-bookmarks"]
  },
  {
    id: "react-flow-add-node",
    file: "31-react-flow-add-node.example.tsx",
    category: "flow-builder",
    title: "노드 추가 플로우",
    description: "버튼으로 새 노드를 만들고 기존 노드와 연결합니다.",
    motionIntent: "추가된 노드는 canvas 안에 등장하고 edge 연결로 관계가 드러납니다.",
    variantIds: ["react-flow-node-count-panel", "react-flow-node-data-table-sync"]
  },
  {
    id: "react-flow-validation",
    file: "65-react-flow-validation.example.tsx",
    category: "flow-builder",
    title: "플로우 검증 상태",
    description: "연결 가능 여부와 에러 상태를 노드/엣지 위에 표시합니다.",
    motionIntent: "검증 결과는 badge와 edge style만 전환해 구조를 유지합니다.",
    variantIds: ["react-flow-prevent-cycles", "react-flow-edge-health-filter"]
  },
  {
    id: "heatmap-legend",
    file: "41-heatmap-legend.example.tsx",
    category: "data-viz",
    title: "히트맵 범례",
    description: "상태 색상과 값 범위를 범례로 함께 설명합니다.",
    motionIntent: "범례 토글은 heat cell 크기를 유지하고 색상 의미만 바꿉니다.",
    variantIds: ["heatmap-severity-legend-toggle", "heatmap-legend-range-edit"]
  },
  {
    id: "heatmap-brush",
    file: "42-heatmap-brush.example.tsx",
    category: "data-viz",
    title: "히트맵 브러시 선택",
    description: "시간/행 범위를 선택해 집중 분석할 구간을 좁힙니다.",
    motionIntent: "선택 영역은 overlay highlight로 표현되어 grid 위치가 변하지 않습니다.",
    variantIds: ["heatmap-window-brush", "heatmap-brush-aggregate"]
  },
  {
    id: "heatmap-tooltip",
    file: "63-heatmap-tooltip.example.tsx",
    category: "data-viz",
    title: "히트맵 상세 툴팁",
    description: "셀 값과 상태 원인을 hover/focus 상태에서 확인합니다.",
    motionIntent: "툴팁은 anchor 주변에서 떠오르며 grid 자체는 고정됩니다.",
    variantIds: ["heatmap-roving-focus-detail", "heatmap-detail-drawer"]
  },
  {
    id: "chart-area-deployment-trend",
    file: "461-chart-area-deployment-trend.example.tsx",
    category: "data-viz",
    title: "배포 추세 영역 차트",
    description: "성공/실패 실행 추세를 면적으로 비교합니다.",
    motionIntent: "계열 전환은 chart frame을 유지하고 stroke/fill만 안정적으로 바꿉니다.",
    variantIds: ["chart-area-default", "chart-area-stacked", "chart-area-gradient"]
  },
  {
    id: "animated-overlay",
    file: "16-animated-overlay.example.tsx",
    category: "motion",
    title: "오버레이 진입 모션",
    description: "현재 화면 위에 뜨는 레이어의 진입과 닫힘을 설명합니다.",
    motionIntent: "backdrop fade와 panel scale을 분리해 레이어 진입 의도를 드러냅니다.",
    variantIds: ["animated-modal-stack-depth", "animated-overlay-anchor"]
  },
  {
    id: "animated-progress",
    file: "17-animated-progress.example.tsx",
    category: "motion",
    title: "진행률 전환",
    description: "긴 작업의 진행 상황을 부드럽지만 예측 가능하게 보여줍니다.",
    motionIntent: "progress fill만 움직이고 label/버튼 크기는 고정합니다.",
    variantIds: ["animated-progress-checkpoints", "animated-progress-segment-fill"]
  },
  {
    id: "animated-tabs",
    file: "52-animated-tabs.example.tsx",
    category: "motion",
    title: "탭 Indicator 모션",
    description: "탭 전환의 위치 변화를 indicator로 안내합니다.",
    motionIntent: "선택 전환은 indicator 위치만 이동해 탭 버튼 폭이 바뀌지 않습니다.",
    variantIds: ["animated-shared-indicator", "animated-route-swipe-tabs"]
  },
  {
    id: "animated-skeleton-to-content",
    file: "184-animated-skeleton-to-content.example.tsx",
    category: "motion",
    title: "스켈레톤에서 결과 전환",
    description: "데이터 로딩 전후의 높이를 유지하며 콘텐츠를 바꿉니다.",
    motionIntent: "outer shell은 고정하고 skeleton/result layer만 crossfade합니다.",
    variantIds: ["component-skeleton-loading-state", "animated-command-search-skeleton"]
  },
  {
    id: "component-accordion-log-stages",
    file: "479-component-accordion-log-stages.example.tsx",
    category: "primitives",
    title: "로그 단계 아코디언",
    description: "작업 단계별 상세를 접고 펼치는 기본 컴포넌트입니다.",
    motionIntent: "열림/닫힘은 내용 영역 높이만 바꾸고 header button 폭은 유지합니다.",
    variantIds: ["animated-accordion", "job-stage-accordion"]
  },
  {
    id: "component-alert-dialog-danger-run",
    file: "480-component-alert-dialog-danger-run.example.tsx",
    category: "primitives",
    title: "위험 실행 대화상자",
    description: "돌이키기 어려운 액션을 실행 전 확인합니다.",
    motionIntent: "dialog enter는 top layer를 명확히 하고 버튼 row는 고정 폭을 유지합니다.",
    variantIds: ["command-confirm-danger", "sonner-destructive-confirm"]
  },
  {
    id: "component-drawer-mobile-filter",
    file: "482-component-drawer-mobile-filter.example.tsx",
    category: "primitives",
    title: "모바일 필터 드로어",
    description: "작은 화면에서도 필터를 하단 레이어로 안정적으로 보여줍니다.",
    motionIntent: "drawer는 safe area 안에서만 slide되고 콘텐츠 영역을 가리지 않습니다.",
    variantIds: ["component-sidebar-responsive-nav", "animated-drawer-snap-points"]
  },
  {
    id: "component-table-row-actions",
    file: "490-component-table-row-actions.example.tsx",
    category: "primitives",
    title: "테이블 행 액션",
    description: "반복 행에서 자주 쓰는 액션을 일관된 위치에 배치합니다.",
    motionIntent: "row action은 hover/focus 상태로만 드러나 테이블 높이를 바꾸지 않습니다.",
    variantIds: ["component-dropdown-row-actions", "command-bulk-select-rows"]
  },
  {
    id: "command-scope-tabs",
    file: "96-command-scope-tabs.example.tsx",
    category: "overlay-command",
    title: "범위 탭 명령 검색",
    description: "현재 화면, 전체 워크스페이스, 최근 작업 범위를 나눠 명령을 찾습니다.",
    motionIntent: "scope 탭은 고정 폭을 유지하고 결과 리스트만 같은 슬롯에서 교체됩니다.",
    variantIds: ["command-progressive-disclosure", "command-object-search"]
  },
  {
    id: "command-slash-actions",
    file: "121-command-slash-actions.example.tsx",
    category: "overlay-command",
    title: "슬래시 액션 입력",
    description: "AI 입력창이나 코멘트 영역 안에서 slash command를 빠르게 호출합니다.",
    motionIntent: "slash menu는 caret 근처에 뜨고 입력 줄 높이를 바꾸지 않습니다.",
    variantIds: ["command-inline-actions", "command-variable-insert"]
  },
  {
    id: "ai-attachment-preview",
    file: "187-ai-attachment-preview.example.tsx",
    category: "ai-layer",
    title: "AI 첨부 미리보기",
    description: "파일, 로그, 이미지 첨부를 AI 대화 맥락 안에서 확인합니다.",
    motionIntent: "첨부 preview는 composer 위 고정 슬롯에서 추가되어 입력창 크기를 안정적으로 유지합니다.",
    variantIds: ["ai-artifact-preview", "ai-source-split"]
  },
  {
    id: "ai-stream-controls",
    file: "216-ai-stream-controls.example.tsx",
    category: "ai-layer",
    title: "AI 스트림 제어",
    description: "응답 생성 중 일시정지, 재개, 중단 상태를 명확히 조작합니다.",
    motionIntent: "제어 버튼은 같은 폭을 유지하고 stream 상태 badge만 바뀝니다.",
    variantIds: ["ai-safety-interruption", "ai-human-checkpoint"]
  },
  {
    id: "job-backoff-retry",
    file: "192-job-backoff-retry.example.tsx",
    category: "job-logs",
    title: "재시도 Backoff",
    description: "실패한 작업이 언제 다시 실행되는지 countdown과 이유를 함께 보여줍니다.",
    motionIntent: "countdown 숫자만 교체되어 상태 카드 높이가 흔들리지 않습니다.",
    variantIds: ["sonner-retry-countdown-badge", "sonner-retry-action"]
  },
  {
    id: "job-git-pull-push-timeline",
    file: "402-job-git-pull-push-timeline.example.tsx",
    category: "job-logs",
    title: "Git Pull/Push 타임라인",
    description: "pull부터 push까지 이어지는 git 작업 흐름을 시간 순으로 추적합니다.",
    motionIntent: "현재 단계 marker만 이동하고 전체 timeline 구조는 고정됩니다.",
    variantIds: ["job-git-operation-stack", "job-stage-toast-sync"]
  },
  {
    id: "drilldown-query-builder",
    file: "226-drilldown-query-builder.example.tsx",
    category: "drilldown-nav",
    title: "쿼리 빌더 드릴다운",
    description: "조건을 추가하며 데이터 범위를 점진적으로 좁힙니다.",
    motionIntent: "조건 chip은 wrap 영역 안에서만 늘어나고 결과 preview는 고정 높이를 유지합니다.",
    variantIds: ["command-filter-builder", "drilldown-faceted-command-link"]
  },
  {
    id: "drilldown-workflow-log-viewer",
    file: "316-drilldown-workflow-log-viewer.example.tsx",
    category: "drilldown-nav",
    title: "워크플로 로그 Viewer",
    description: "workflow/job/step/log를 한 흐름으로 따라가며 실패 위치를 확인합니다.",
    motionIntent: "선택 변경은 로그 pane 내용만 교체해 탐색 기준을 유지합니다.",
    variantIds: ["drilldown-workflow-job-step-log", "job-github-actions-log-drilldown"]
  },
  {
    id: "react-flow-save-restore",
    file: "68-react-flow-save-restore.example.tsx",
    category: "flow-builder",
    title: "플로우 저장/복원",
    description: "사용자가 편집한 그래프 상태를 저장하고 다시 불러옵니다.",
    motionIntent: "복원 동작은 viewport와 node positions를 함께 되돌려 편집 맥락을 보존합니다.",
    variantIds: ["react-flow-undo-redo", "react-flow-copy-paste"]
  },
  {
    id: "react-flow-undo-redo",
    file: "230-react-flow-undo-redo.example.tsx",
    category: "flow-builder",
    title: "플로우 되돌리기/다시 실행",
    description: "노드 편집 작업을 되돌리거나 다시 적용합니다.",
    motionIntent: "history 이동은 inspector와 graph 상태를 동시에 갱신합니다.",
    variantIds: ["react-flow-copy-paste", "react-flow-download-panel"]
  },
  {
    id: "chart-bar-run-status",
    file: "462-chart-bar-run-status.example.tsx",
    category: "data-viz",
    title: "실행 상태 막대 차트",
    description: "성공, 실패, 대기 상태를 막대 차트로 비교합니다.",
    motionIntent: "상태 값만 바뀌고 chart frame과 axis 영역은 유지됩니다.",
    variantIds: ["chart-bar-default", "chart-bar-stacked"]
  },
  {
    id: "chart-tooltip-comparison",
    file: "467-chart-tooltip-comparison.example.tsx",
    category: "data-viz",
    title: "비교 툴팁 차트",
    description: "같은 지표의 이전/현재 값을 tooltip에서 비교합니다.",
    motionIntent: "tooltip은 chart 위에 떠오르고 데이터 점/축 위치는 바뀌지 않습니다.",
    variantIds: ["chart-area-interactive", "chart-line-latency-sla"]
  },
  {
    id: "animated-resizable-split-view",
    file: "273-animated-resizable-split-view.example.tsx",
    category: "motion",
    title: "리사이즈 Split View",
    description: "목록과 상세 패널의 비율을 조절하는 화면 전환을 보여줍니다.",
    motionIntent: "divider 이동만 애니메이션되고 panel 내용은 overflow 안에서 안정적으로 유지됩니다.",
    variantIds: ["component-resizable-split-workbench", "animated-resize-panel"]
  },
  {
    id: "animated-height-reveal",
    file: "302-animated-height-reveal.example.tsx",
    category: "motion",
    title: "높이 Reveal",
    description: "추가 정보가 펼쳐질 때 주변 레이아웃이 이해 가능한 속도로 재배치됩니다.",
    motionIntent: "height 변화는 controlled reveal로 처리하고 버튼 폭은 고정합니다.",
    variantIds: ["animated-collapsible-log", "animated-stack-collapse"]
  },
  {
    id: "component-resizable-split-workbench",
    file: "486-component-resizable-split-workbench.example.tsx",
    category: "primitives",
    title: "Resizable 작업대",
    description: "리스트, 상세, 로그 패널을 분할 영역으로 구성합니다.",
    motionIntent: "resize handle만 이동하고 각 panel의 header와 controls는 고정됩니다.",
    variantIds: ["animated-resizable-split-view", "drilldown-column-resizable"]
  },
  {
    id: "component-message-scroller",
    file: "500-component-message-scroller.example.tsx",
    category: "primitives",
    title: "메시지 스크롤러",
    description: "대화나 로그 메시지를 안정적인 스크롤 영역에서 표시합니다.",
    motionIntent: "새 메시지는 scroll container 안에서만 추가되어 outer card 높이를 유지합니다.",
    variantIds: ["ai-streaming-message", "job-live-tail"]
  }
];

export const exposedExamples: ExampleCatalogEntry[] = [...primaryExamples, ...supplementalExamples];

export const variantGroups: VariantGroup[] = [
  {
    name: "명령 팔레트 변형",
    representativeId: "command-basic",
    archivedIds: ["command-shortcuts", "command-groups", "command-scrollable", "command-async-results", "command-pages", "command-recent-actions", "command-filter-tags", "command-quick-create", "command-pinned-actions"]
  },
  {
    name: "토스트 상태와 액션",
    representativeId: "job-progress-strip",
    archivedIds: ["sonner-basic", "sonner-types", "sonner-description", "sonner-position", "sonner-action", "sonner-promise", "sonner-update-toast", "sonner-duration", "sonner-retry-action", "sonner-progress-with-action"]
  },
  {
    name: "작업 진행과 로그",
    representativeId: "job-progress-strip",
    archivedIds: ["job-queue", "job-retry-failure", "job-activity-feed", "job-live-tail", "job-dependency-list", "job-git-sync-runner", "job-github-actions-log-drilldown"]
  },
  {
    name: "드릴다운 탐색",
    representativeId: "workflow-drilldown",
    archivedIds: ["timeline-drilldown", "table-drilldown", "breadcrumb-drilldown", "tree-drilldown", "master-detail-empty", "drilldown-column-browser"]
  },
  {
    name: "작은 히트맵 셀 탐색",
    representativeId: "heatmap-cluster-treemap",
    archivedIds: ["heatmap-lens-detail", "heatmap-legend", "heatmap-brush", "heatmap-tooltip", "calendar-heatmap", "heatmap-threshold-filter", "heatmap-row-column-select"]
  },
  {
    name: "차트 변형",
    representativeId: "chart-area-interactive",
    archivedIds: ["chart-area-default", "chart-area-linear", "chart-area-step", "chart-area-legend", "chart-area-stacked", "chart-area-gradient", "chart-bar-run-status", "chart-pie-alert-channel"]
  },
  {
    name: "모션 변형",
    representativeId: "animated-drawer-snap-points",
    archivedIds: ["animated-overlay", "animated-progress", "animated-timeline", "animated-tabs", "animated-accordion", "animated-resize-panel", "animated-skeleton-to-content", "animated-command-search-skeleton", "animated-modal-focus-trap"]
  },
  {
    name: "React Flow 변형",
    representativeId: "react-flow-workflow",
    archivedIds: ["react-flow-subflow", "react-flow-minimap", "react-flow-add-node", "react-flow-edge-label", "react-flow-inspector", "react-flow-validation", "react-flow-save-restore"]
  }
];
