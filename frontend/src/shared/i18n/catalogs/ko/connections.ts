import type { ConnectionsMessageKey } from "../../keys/connections";

export const connectionsKo = {
  "connections.launcher.title": "환경 연결",
  "connections.launcher.description": "무엇을 연결할까요?",
  "connections.launcher.repository.title": "Git 저장소",
  "connections.launcher.repository.description": "매니페스트를 찾아 연결된 클러스터에 배포합니다.",
  "connections.launcher.cluster.title": "Kubernetes 클러스터",
  "connections.launcher.cluster.description": "아웃바운드 에이전트를 설치하고 검증된 관측을 시작합니다.",
  "connections.repository.source.checking": "저장소를 확인하는 중…",
  "connections.repository.source.notFound.title": "저장소를 찾을 수 없습니다",
  "connections.repository.source.notFound.description": "저장소 주소와 접근 권한을 확인한 뒤 다시 시도하세요.",
  "connections.repository.source.visibility.public": "공개",
  "connections.repository.source.visibility.private": "비공개",
  "connections.repository.source.manifestCount": "매니페스트 {count}개",
  "connections.repository.source.privateToken": "비공개 저장소에 접근하려면 액세스 토큰이 필요합니다.",
  "connections.repository.source.tokenPlaceholder": "저장소 액세스 토큰 붙여넣기",
} satisfies Record<ConnectionsMessageKey, string>;
