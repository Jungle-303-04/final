// ⚠ 임시 더미 데이터 — VP-021 사용성 프리뷰 전용.
// 실제 배선(백엔드 응답 → 파트 변환) 완료 시 이 파일을 통째로 삭제한다.
// docs/plans/vp-021-ai-assistant.md §"더미 제거" 참조.
import type { AiConversation } from "./aiConversationContract";

export const DUMMY_CONVERSATION: AiConversation = {
  id: "aic-dummy",
  title: "redis 장애 분석",
  updatedAt: new Date().toISOString(),
  turns: [
    {
      id: "t0",
      role: "assistant",
      collapsed: true,
      summary: "OOMKilled · 메모리 107%로 임계 초과 · 5분 전",
      createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      parts: [{ kind: "text", markdown: "" }],
    },
    {
      id: "t1",
      role: "user",
      question: "redis 파드가 왜 죽었어?",
      collapsed: false,
      createdAt: new Date(Date.now() - 90_000).toISOString(),
    },
    {
      id: "t2",
      role: "assistant",
      collapsed: false,
      createdAt: new Date(Date.now() - 84_000).toISOString(),
      parts: [
        {
          kind: "steps",
          running: false,
          steps: [
            { id: "s1", label: "리소스 조회", detail: "redis 파드 9건", state: "done" },
            { id: "s2", label: "메트릭 확인", detail: "메모리 107% · CPU 62%", state: "done" },
            { id: "s3", label: "로그 확인", detail: "OOMKilled 종료 이벤트 2건", state: "done" },
          ],
        },
        {
          kind: "text",
          markdown:
            "`redis-605` 파드가 **OOMKilled**로 종료됐습니다. 관측된 근거상 메모리 사용률이 한도(512Mi) 대비 **107%**까지 올라 컨테이너가 강제 종료됐고, 직전 5분간 요청량이 3배로 늘었습니다.",
        },
        {
          kind: "result",
          title: "OOMKilled",
          tone: "critical",
          summary: "메모리 한도 초과로 컨테이너 강제 종료",
          metrics: [
            { label: "메모리", value: "107%", tone: "critical" },
            { label: "CPU", value: "62%", tone: "warning" },
            { label: "재시작", value: "2회", tone: "warning" },
          ],
        },
        {
          kind: "evidence",
          items: [
            { type: "event", id: "e1", label: "Event · OOMKilled @ 19:34", link: "/resources?detail=pod/platform/redis-605" },
            { type: "metric", id: "m1", label: "메모리 시계열 · 107%", link: "/resources?detail=pod/platform/redis-605&tab=metrics" },
            { type: "log", id: "l1", label: "로그 · signal: killed", link: "/resources?detail=pod/platform/redis-605&tab=logs" },
          ],
        },
        {
          kind: "links",
          items: [
            { label: "이 파드 상세 열기", href: "/resources?detail=pod/platform/redis-605", icon: "resources" },
            { label: "인시던트로 보기", href: "/issues", icon: "incident" },
          ],
        },
      ],
    },
    {
      id: "t3",
      role: "user",
      question: "이 클러스터 CPU가 70% 넘으면 알람 걸어줘",
      collapsed: false,
      createdAt: new Date(Date.now() - 40_000).toISOString(),
    },
    {
      id: "t4",
      role: "assistant",
      collapsed: false,
      createdAt: new Date(Date.now() - 36_000).toISOString(),
      parts: [
        {
          kind: "action",
          proposal: {
            type: "create_alert_rule",
            rationale: "현재 화면 필터에서 파드 CPU가 70%를 20초 이상 넘으면 알리도록 제안했습니다.",
            payload: {
              name: "파드 CPU 70% 알림",
              metric: "cpu_pct",
              comparator: ">",
              threshold: 70,
              forSeconds: 20,
              severity: "high",
              scope: { clusters: ["game-server"], namespaces: [], applications: [], labels: [] },
              channels: [],
              enabled: true,
            },
          },
        },
      ],
    },
    {
      id: "t5",
      role: "user",
      question: "지금 상태는 어때?",
      collapsed: false,
      createdAt: new Date(Date.now() - 4_000).toISOString(),
    },
    {
      id: "t6",
      role: "assistant",
      collapsed: false,
      createdAt: new Date().toISOString(),
      parts: [
        {
          kind: "steps",
          running: true,
          steps: [
            { id: "s4", label: "리소스 조회", detail: "6건 확인", state: "done" },
            { id: "s5", label: "메트릭 확인", detail: null, state: "running" },
          ],
        },
        { kind: "status", state: "pending" },
      ],
    },
  ],
};

export const DUMMY_SUGGESTIONS = [
  "지금 위험한 리소스가 있어?",
  "이 클러스터에 알람을 걸어줘",
  "최근 배포로 바뀐 게 뭐야?",
];

export const DUMMY_CONVERSATION_LIST = [
  { id: "aic-dummy", title: "redis 장애 분석", updatedAt: "방금" },
  { id: "aic-2", title: "game-server CPU 알림 설정", updatedAt: "12분 전" },
  { id: "aic-3", title: "shop-frontend 롤백 확인", updatedAt: "1시간 전" },
];
