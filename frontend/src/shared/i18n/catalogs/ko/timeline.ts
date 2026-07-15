import type { TimelineMessageKey } from "../../keys/timeline";

export const timelineKo = {
  "timeline.title": "타임라인",
  "timeline.description": "타임라인 필터는 URL로 공유할 수 있습니다. 시각화와 이벤트 상세 상호작용은 다음 이식 단계에서 연결합니다.",
  "timeline.search": "타임라인 검색",
  "timeline.view": "타임라인 보기",
  "timeline.view.list": "목록",
  "timeline.view.swimlane": "스윔레인",
  "timeline.loading": "타임라인 데이터를 불러오는 중…",
  "timeline.error.title": "타임라인 데이터를 사용할 수 없습니다.",
  "timeline.error.description": "타임라인 서비스가 사용할 수 있는 응답을 반환하지 않았습니다.",
  "timeline.action.retry": "타임라인 다시 시도",
  "timeline.empty": "이 범위에 일치하는 타임라인 이벤트가 없습니다.",
  "timeline.count.one": "선택한 범위에서 이벤트 {count}개를 사용할 수 있습니다.",
  "timeline.count.other": "선택한 범위에서 이벤트 {count}개를 사용할 수 있습니다.",
} satisfies Record<TimelineMessageKey, string>;
