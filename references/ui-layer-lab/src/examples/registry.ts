import type { ExampleModule, RegisteredExample } from "./types";

const componentModules = import.meta.glob<ExampleModule>("./*.example.tsx", {
  eager: true
});

const sourceModules = import.meta.glob<string>("./*.example.tsx", {
  eager: true,
  import: "default",
  query: "?raw"
});

export const examples: RegisteredExample[] = Object.entries(componentModules)
  .map(([path, module]) => {
    const file = path.split("/").pop() ?? "";
    const order = Number(file.match(/^(\d+)/)?.[1] ?? 0);
    const id = file.replace(/^\d+-/, "").replace(/\.example\.tsx$/, "");

    return {
      id,
      order,
      title: titleFromId(id),
      Component: module.default,
      source: (sourceModules[path] ?? "").trim()
    };
  })
  .sort((a, b) => a.order - b.order);

function titleFromId(id: string) {
  return id
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export function descriptionFor(id: string) {
  return (
    {
      "command-basic": "검색과 페이지 이동을 포함한 기본 명령 메뉴.",
      "ai-quick-input": "현재 화면 위에서 빠르게 질문을 받는 AI 입력.",
      "assistant-drawer": "대화와 컨텍스트를 우측 패널에 고정하는 AI drawer.",
      "job-progress-strip": "긴 작업의 진행률을 상단 strip으로 표시.",
      "job-log-drawer": "작업 항목을 클릭해 로그 drawer를 여는 패턴.",
      "workflow-drilldown": "workflow, job, step, log 순서로 실패 원인을 좁히는 드릴다운.",
      "resource-drilldown": "cluster, namespace, workload, pod 계층을 탐색하는 드릴다운.",
      "drilldown-picker": "데이터 모양에 따라 드릴다운 방식을 선택.",
      "heatmap-drilldown": "히트맵 셀을 눌러 해당 조건의 상세로 이동.",
      "react-flow-workflow": "React Flow 커스텀 노드로 작업 흐름을 표현.",
      "react-flow-subflow": "group node로 여러 step을 하나의 stage에 묶는 패턴.",
      "command-shortcuts": "단축키가 표시되는 명령 메뉴.",
      "command-groups": "그룹, 아이콘 및 구분이 포함된 명령 메뉴.",
      "command-scrollable": "긴 목록을 검색하고 스크롤하는 명령 메뉴.",
      "command-rtl": "RTL 방향성을 지원하는 명령 메뉴.",
      "animated-overlay": "오버레이가 부드럽게 등장하고 사라지는 패턴.",
      "animated-progress": "작업 진행률과 상태 변화를 애니메이션으로 표시.",
      "animated-timeline": "이벤트 타임라인이 순차적으로 강조되는 패턴.",
      "sonner-basic": "기본 toast를 표시하는 가장 작은 Sonner 예제.",
      "sonner-types": "default, success, info, warning, error, promise toast.",
      "sonner-description": "toast에 보조 설명을 함께 표시.",
      "sonner-position": "toast 위치를 버튼으로 바꿔 확인.",
      "sonner-action": "toast 안에 후속 액션 버튼을 제공."
    }[id] ?? "동작하는 UI 예제."
  );
}
