from __future__ import annotations

from enum import StrEnum

# NATS JetStream 스트림 이름. 전 서비스 이벤트가 이 한 스트림에 적재.
STREAM_NAME = "SERVICE_EVENTS"

# 스트림 보존 한계. 무한 증가/암묵적 드롭을 막는 위생 설정.
# discard 기본값은 old(가득 차면 오래된 것부터 제거). max_age 는 초 단위.
STREAM_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7일
STREAM_MAX_BYTES = 1024 * 1024 * 1024  # 1 GiB

# 스트림이 받는 subject 와일드카드. 도메인별로 "<도메인>.>" 한 줄씩.
# 새 도메인 이벤트 추가 시 여기 와일드카드도 함께.
STREAM_SUBJECTS = [
    "oauth.>",
    "git.>",
    "manifest.>",
    "desired.>",
    "diff.>",
    "cluster.>",
    "evidence.>",
    "command.>",
    "rca.>",
    "safe_pr.>",
    "dashboard.>",
    "audit.>",
    "agent.>",
    "dead_letter.>",
    "demo.>",
]


class EventSubject(StrEnum):
    """이벤트 subject(주제).

    네이밍 규칙: "<도메인>.<행동>[.<상세>]" 점(.) 구분 소문자.
    - 과거형(git.changed) = 이미 일어난 사실.
    - 요청형(command.requested) = 처리 요청 신호.
    StrEnum 이라 멤버 자체가 와이어 문자열.
    """

    # --- 인증(api-gateway): OAuth 연결 ---
    OAUTH_START_REQUESTED = "oauth.start.requested"  # OAuth 시작 요청
    OAUTH_CONNECTED = "oauth.connected"  # 계정 연결 완료

    # --- GitOps 동기화(gitops-sync-worker): webhook→manifest→diff ---
    GIT_WEBHOOK_RECEIVED = "git.webhook.received"  # 깃 webhook 수신(입구)
    GIT_CHANGED = "git.changed"  # 변경 확정
    MANIFEST_RENDERED = "manifest.rendered"  # k8s manifest 렌더
    DESIRED_DIFF_DETECTED = "desired.diff.detected"  # 원하는 상태와 차이 감지
    DIFF_ANALYZED = "diff.analyzed"  # diff 위험도 분석 결과

    # --- 대상 클러스터/에이전트(target-cluster-agent) ---
    AGENT_CONNECTED = "agent.connected"  # 에이전트 등록
    CLUSTER_EVIDENCE_RECEIVED = "cluster.evidence.received"  # 증거 수신(입구)

    # --- 명령 처리(command-worker): 정책→디스패치→에이전트 큐 ---
    COMMAND_REQUESTED = "command.requested"  # 명령 요청
    COMMAND_REJECTED = "command.rejected"  # 정책 위반 거부
    COMMAND_DISPATCH_READY = "command.dispatch.ready"  # 실행 계획 수립
    COMMAND_DISPATCHED = "command.dispatched"  # 대상 클러스터로 라우팅
    COMMAND_QUEUED_FOR_AGENT = "command.queued_for_agent"  # 에이전트 큐 적재
    COMMAND_COMPLETED = "command.completed"  # 에이전트 실행 완료

    # --- 원인 분석/안전 PR(rca-worker) ---
    EVIDENCE_BUILT = "evidence.built"  # 증거 번들 구성
    RCA_COMPLETED = "rca.completed"  # 근본 원인 분석 완료
    SAFE_PR_REQUESTED = "safe_pr.requested"  # PR 생성 요청(공통)
    SAFE_PR_CREATED = "safe_pr.created"  # repo-gateway 가 PR 생성 완료
    SAFE_PR_FAILED = "safe_pr.failed"  # repo-gateway 가 PR 생성 실패

    # --- 읽기 모델(dashboard-projection-service) ---
    DASHBOARD_UPDATED = "dashboard.updated"  # 대시보드 카드 갱신

    # --- 신뢰성(공통): 재시도 소진 시 DLQ ---
    DEAD_LETTER_CREATED = "dead_letter.created"  # 죽은 편지(DLQ) 적재

    # --- demo(ping↔pong): 프레임워크 한 바퀴 학습용 ---
    DEMO_PING_REQUESTED = "demo.ping.requested"  # API 입구
    DEMO_PONG_REQUESTED = "demo.pong.requested"  # 워커 → outbound 게이트웨이
    DEMO_PONG_DELIVERED = "demo.pong.delivered"  # 외부 호출 성공
    DEMO_PONG_FAILED = "demo.pong.failed"  # 외부 호출 실패
