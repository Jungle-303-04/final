import { describe, expect, it } from "vitest";

import { detectLocalShell, toPowerShellCommand } from "./devpreview-connect";

// P0 이름-only 연결 · 설치 명령 OS 탭 계약: 서버 생성 명령의 셸-충실 변환만 한다
// (내용/토큰 발명 0). POSIX 는 원문, PowerShell 은 heredoc→here-string 구문 변환.

describe("detectLocalShell", () => {
  it("윈도우 플랫폼이면 PowerShell, 그 외는 POSIX 를 기본 선택한다", () => {
    expect(detectLocalShell("Win32")).toBe("powershell");
    expect(detectLocalShell("Windows NT 10.0")).toBe("powershell");
    expect(detectLocalShell("MacIntel")).toBe("posix");
    expect(detectLocalShell("Linux x86_64")).toBe("posix");
    expect(detectLocalShell("")).toBe("posix");
  });
});

describe("toPowerShellCommand", () => {
  it("heredoc 설치 명령을 here-string 파이프로 충실 변환한다(본문/토큰 보존)", () => {
    const posix = "kubectl apply -f - <<'EOF'\napiVersion: v1\nkind: Secret\ndata:\n  token: abc123\nEOF";
    const ps = toPowerShellCommand(posix);
    expect(ps.startsWith("@'\n")).toBe(true);
    expect(ps).toContain("token: abc123"); // 서버 발급 내용 그대로
    expect(ps).toContain("'@ | kubectl apply -f -");
    expect(ps).not.toContain("EOF");
  });

  it("heredoc 이 없는 단일 명령은 그대로 둔다(PowerShell 에서도 유효)", () => {
    const cmd = "kubectl apply -f https://kyro.example/install.yaml --token abc";
    expect(toPowerShellCommand(cmd)).toBe(cmd);
  });
});
