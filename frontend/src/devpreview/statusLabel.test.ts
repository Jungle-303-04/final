import { describe, expect, it } from "vitest";

import { operationalMessageLabel, reasonLabel, statusLabel } from "./statusLabel";

describe("devpreview display labels", () => {
  it("localizes status tokens without changing unknown status evidence", () => {
    expect(statusLabel("incident_resolved")).toBe("인시던트 해결");
    expect(statusLabel("trusted_proxy")).toBe("상위 프록시 인증");
    expect(statusLabel("agent_connected")).toBe("에이전트 연결됨");
    expect(statusLabel("awaiting_install")).toBe("설치 대기");
    expect(statusLabel("expired")).toBe("설치 만료");
    expect(statusLabel("custom-observed-state")).toBe("custom-observed-state");
  });

  it("does not expose known reason codes or the GitOps source binding message", () => {
    expect(reasonLabel("application_bindings_incomplete")).toBe("애플리케이션 연결 정보가 아직 완전하지 않습니다.");
    expect(reasonLabel("checks_observation_unavailable:cluster-a")).toBe("점검 관측 데이터가 아직 없습니다.");
    expect(reasonLabel("cluster_id is already registered")).toBe("이미 등록된 클러스터입니다.");
    expect(reasonLabel("No exact GitOps source binding was found for this live resource.")).toBe(
      "이 라이브 리소스와 정확히 일치하는 GitOps 원본 연결을 찾지 못했습니다.",
    );
  });

  it("localizes known operational messages for Korean presentation mode", () => {
    expect(operationalMessageLabel("git change confirmed; rendering manifest")).toBe("Git 변경 확인 · 매니페스트 반영 중");
    expect(operationalMessageLabel("Pod readiness failure")).toBe("파드 준비 상태 실패");
  });
});
