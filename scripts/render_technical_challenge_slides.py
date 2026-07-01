from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape


OUT_DIR = Path("docs/technical-challenges")
W = 1280
H = 720
BLUE = "#3158e8"
BLUE_DARK = "#243bbd"
BLUE_LIGHT = "#eaf1ff"
LINE = "#2f5cf6"
TEXT = "#111827"
MUTED = "#4b5563"
GREEN = "#22c55e"
GREEN_LIGHT = "#dcfce7"
ORANGE = "#f59e0b"
ORANGE_LIGHT = "#fff7ed"
RED = "#ef4444"
RED_LIGHT = "#fee2e2"
PURPLE = "#7c3aed"
PURPLE_LIGHT = "#f3e8ff"
GRAY = "#e5e7eb"
FONT = "'Apple SD Gothic Neo', 'AppleGothic', 'Arial Unicode MS', sans-serif"


def esc(value: str) -> str:
    return escape(value, {"'": "&apos;", '"': "&quot;"})


class Canvas:
    def __init__(self, title: str) -> None:
        self.items: list[str] = []
        self.title = title

    def add(self, raw: str) -> None:
        self.items.append(raw)

    def rect(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        fill: str = "white",
        stroke: str = LINE,
        sw: int = 2,
        rx: int = 8,
        dashed: bool = False,
    ) -> None:
        dash = ' stroke-dasharray="8 6"' if dashed else ""
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash}/>'
        )

    def line(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        color: str = "#6b8fc5",
        sw: int = 5,
        dashed: bool = False,
    ) -> None:
        dash = ' stroke-dasharray="8 7"' if dashed else ""
        self.add(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round" '
            f'marker-end="url(#arrow)"{dash}/>'
        )

    def text(
        self,
        x: int,
        y: int,
        lines: str | list[str],
        size: int = 24,
        weight: int = 700,
        fill: str = TEXT,
        anchor: str = "start",
        line_gap: int | None = None,
    ) -> None:
        if isinstance(lines, str):
            lines = [lines]
        gap = line_gap or int(size * 1.25)
        self.add(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">'
        )
        for idx, line in enumerate(lines):
            dy = 0 if idx == 0 else gap
            self.add(f'<tspan x="{x}" dy="{dy}">{esc(line)}</tspan>')
        self.add("</text>")

    def center_text(
        self,
        x: int,
        y: int,
        lines: str | list[str],
        size: int = 22,
        weight: int = 700,
        fill: str = TEXT,
        line_gap: int | None = None,
    ) -> None:
        self.text(x, y, lines, size=size, weight=weight, fill=fill, anchor="middle", line_gap=line_gap)

    def pill(self, x: int, y: int, w: int, h: int, label: str, fill: str, fg: str = "white") -> None:
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h // 2}" fill="{fill}"/>')
        self.center_text(x + w // 2, y + h // 2 + 6, label, size=18, weight=800, fill=fg)

    def step(self, cx: int, cy: int, num: int) -> None:
        self.add(f'<circle cx="{cx}" cy="{cy}" r="24" fill="#f3cd61"/>')
        self.center_text(cx, cy + 7, str(num), size=22, weight=800, fill=TEXT)

    def card(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        title: str,
        body: list[str],
        fill: str = "white",
        stroke: str = LINE,
        title_fill: str = TEXT,
        body_fill: str = MUTED,
        dashed: bool = False,
    ) -> None:
        self.rect(x, y, w, h, fill=fill, stroke=stroke, sw=2, rx=8, dashed=dashed)
        self.add(f'<line x1="{x}" y1="{y + 46}" x2="{x + w}" y2="{y + 46}" stroke="{stroke}" stroke-width="2"/>')
        title_lines = title.split("\n")
        if len(title_lines) == 1:
            self.center_text(x + w // 2, y + 31, title_lines, size=20, weight=800, fill=title_fill)
        else:
            self.center_text(x + w // 2, y + 20, title_lines, size=17, weight=800, fill=title_fill, line_gap=18)
        self.text(x + 18, y + 75, body, size=17, weight=600, fill=body_fill, line_gap=23)

    def big_panel(self, x: int, y: int, w: int, h: int, title: str) -> None:
        self.rect(x, y, w, h, fill="#f8fbff", stroke=LINE, sw=4, rx=4)
        self.center_text(x + w // 2, y + 35, title, size=32, weight=900, fill=BLUE)

    def base(self) -> str:
        return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
  <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
    <path d="M2,2 L10,6 L2,10 Z" fill="#6b8fc5"/>
  </marker>
  <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.12"/>
  </filter>
</defs>
<rect width="{W}" height="{H}" fill="{BLUE}"/>
<rect x="26" y="20" width="{W - 52}" height="{H - 40}" rx="20" fill="white" filter="url(#softShadow)"/>
<text x="72" y="74" font-family="{FONT}" font-size="34" font-weight="900" fill="{TEXT}">{esc(self.title)}</text>
<line x1="72" y1="104" x2="{W - 72}" y2="104" stroke="{LINE}" stroke-width="2"/>
{''.join(self.items)}
</svg>"""


def save(name: str, canvas: Canvas) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{name}.svg").write_text(canvas.base(), encoding="utf-8")


def slide_desired_state() -> Canvas:
    c = Canvas("기술적 챌린지 - Desired State 기준 선택")
    c.step(330, 164, 1)
    c.card(
        78,
        150,
        270,
        168,
        "PostgreSQL::GitOps State",
        ["target_desired_states", "workflow / approval 상태", "API, 권한, 감사 추적 쉬움"],
        fill=BLUE_LIGHT,
    )
    c.line(362, 234, 487, 234)
    c.step(520, 164, 2)
    c.big_panel(480, 145, 340, 320, "Source of Truth")
    c.card(520, 215, 120, 108, "SQL-first", ["MVP 기준", "빠른 구현"], fill="white", stroke=BLUE)
    c.center_text(660, 277, "VS", size=28, weight=900, fill=TEXT)
    c.card(682, 215, 110, 108, "CRD-first", ["운영성", "controller"], fill="white", stroke=BLUE)
    c.line(652, 340, 652, 390, color="#6b8fc5", sw=5)
    c.add(f'<rect x="548" y="388" width="210" height="48" rx="8" fill="{BLUE}"/>')
    c.center_text(653, 419, "MVP는 SQL-first", size=22, weight=900, fill="white")
    c.text(520, 454, ["운영급 전환 시 CRD mirror로 확장"], size=17, weight=700, fill=BLUE_DARK)
    c.line(832, 234, 938, 234)
    c.step(930, 164, 3)
    c.card(
        940,
        150,
        270,
        168,
        "Kubernetes CRD Mirror",
        ["GitOps 상태를 K8s resource로 반영", "SQL과 CRD 기준점 동기화", "운영급 controller 확장 준비"],
        fill=GREEN_LIGHT,
        stroke=GREEN,
    )
    c.rect(172, 385, 936, 124, fill=ORANGE_LIGHT, stroke=ORANGE, sw=2, rx=10)
    c.text(202, 426, "발표 포인트", size=23, weight=900, fill=TEXT)
    c.text(
        202,
        458,
        [
            "MVP에서는 SQL이 source of truth라 빠르게 추적과 권한 제어가 가능하다.",
            "운영급으로 가면 CRD mirror를 추가해 Kubernetes-native controller와 연결한다.",
        ],
        size=19,
        weight=700,
        fill=MUTED,
        line_gap=28,
    )
    return c


def slide_reconciler() -> Canvas:
    c = Canvas("기술적 챌린지 - Reconciler 실행 위치 분리")
    c.text(112, 150, "Management Plane", size=28, weight=900, fill=TEXT)
    c.text(885, 150, "Target Cluster", size=28, weight=900, fill=TEXT)
    c.card(86, 185, 250, 122, "Workflow Controller", ["desired state 저장", "승인 단계와 실행 흐름 관리"], fill=BLUE_LIGHT)
    c.card(86, 348, 250, 122, "Command Worker", ["정책 검사", "agent command queue 생성"], fill=BLUE_LIGHT)
    c.card(390, 265, 260, 122, "Target Reconcile Worker", ["desired / actual 비교", "drift 이벤트 생성"], fill=BLUE_LIGHT)
    c.line(336, 246, 390, 305)
    c.line(336, 409, 390, 346)
    c.rect(690, 210, 156, 214, fill="#eef6ff", stroke="#93c5fd", sw=2, rx=14)
    c.center_text(768, 255, ["API Gateway", "+", "Outbound API"], size=22, weight=900, fill=BLUE_DARK, line_gap=30)
    c.line(650, 326, 690, 326)
    c.line(846, 326, 910, 326)
    c.line(910, 380, 846, 380, dashed=True)
    c.text(676, 466, ["명령은 오른쪽으로,", "상태/telemetry는 왼쪽으로"], size=18, weight=800, fill=MUTED, line_gap=26)
    c.card(910, 185, 280, 122, "Target Cluster Agent", ["actual state 조회", "명령 수신 / 정책 guard"], fill=GREEN_LIGHT, stroke=GREEN)
    c.card(910, 348, 280, 122, "Agent GitOps Executor", ["dry-run / server-side apply", "rollout watch / actual snapshot"], fill=GREEN_LIGHT, stroke=GREEN, dashed=True)
    c.card(910, 510, 280, 100, "Kubernetes API + RBAC", ["sandbox namespace만 write", "pods/events/nodes/services read"], fill="white", stroke=GREEN)
    c.line(1050, 307, 1050, 348)
    c.line(1050, 470, 1050, 510)
    c.rect(92, 538, 710, 92, fill=ORANGE_LIGHT, stroke=ORANGE, sw=2, rx=10)
    c.text(
        120,
        575,
        ["핵심 판단: credential을 Management Plane에 많이 저장하지 않기 위해", "실제 apply는 Target Agent 쪽으로 이동한다."],
        size=18,
        weight=800,
        fill=TEXT,
        line_gap=26,
    )
    return c


def slide_git_cache() -> Canvas:
    c = Canvas("기술적 챌린지 - Git / Helm Cache와 Artifact")
    c.card(76, 160, 240, 290, "GitHub Repo", ["branch / PR / commit", "Helm chart / values", "Kustomize / raw YAML"], fill="white", stroke="#374151")
    c.text(112, 505, ["문제", "여러 workflow가 매번 clone/render하면", "느리고 실패 지점이 늘어난다."], size=20, weight=800, fill=TEXT, line_gap=30)
    c.line(326, 305, 430, 305)
    c.step(408, 236, 1)
    c.big_panel(420, 145, 450, 360, "Cache / Render")
    c.card(456, 215, 170, 112, "Git Cache\nWorker", ["repo mirror/fetch", "commit checkout"], fill="white")
    c.card(676, 215, 170, 112, "Manifest Render\nWorker", ["Helm / Kustomize", "YAML render"], fill="white")
    c.line(626, 272, 676, 272)
    c.card(532, 370, 260, 90, "Object / Secret\nStores", ["artifact bundle", "digest / provenance"], fill=PURPLE_LIGHT, stroke=PURPLE)
    c.line(758, 327, 680, 370)
    c.line(596, 327, 612, 370)
    c.line(878, 305, 950, 305)
    c.step(902, 236, 2)
    c.card(950, 160, 250, 122, "Diff Worker", ["desired manifest와", "actual snapshot 비교"], fill=GREEN_LIGHT, stroke=GREEN)
    c.card(950, 342, 250, 122, "Target Reconcile Worker", ["drift/reconcile 이벤트 생성", "배포 상태 추적"], fill=GREEN_LIGHT, stroke=GREEN)
    c.line(1075, 282, 1075, 342)
    c.rect(386, 542, 638, 92, fill=ORANGE_LIGHT, stroke=ORANGE, sw=2, rx=10)
    c.text(
        414,
        579,
        ["해결: repo + commit + chart version 기준으로 cache하고,", "결과물은 digest와 provenance로 추적한다."],
        size=19,
        weight=900,
        fill=TEXT,
        line_gap=26,
    )
    return c


def slide_closed_loop() -> Canvas:
    c = Canvas("기술적 챌린지 - 장애에서 PR까지의 폐루프")
    c.card(64, 168, 170, 110, "Target Telemetry", ["metrics / logs", "events / state"], fill=GREEN_LIGHT, stroke=GREEN)
    c.line(236, 224, 310, 224)
    c.card(310, 168, 180, 110, "Evidence Builder\nWorker", ["운영 데이터를", "증거 묶음으로 정리"], fill=BLUE_LIGHT)
    c.line(492, 224, 566, 224)
    c.card(566, 168, 180, 110, "Incident Detector\nWorker", ["장애 여부", "심각도 판단"], fill=BLUE_LIGHT)
    c.line(748, 224, 822, 224)
    c.card(822, 168, 180, 110, "RCA Analyzer\nWorker", ["원인 후보", "confidence 생성"], fill=BLUE_LIGHT)
    c.line(1004, 224, 1072, 224)
    c.card(1072, 168, 160, 110, "Recovery Planner\nWorker", ["복구안 생성", "rollback / restart"], fill=BLUE_LIGHT)

    c.step(386, 132, 1)
    c.step(910, 132, 2)
    c.line(1152, 278, 1152, 348)
    c.add(f'<polygon points="1152,342 1232,410 1152,478 1072,410" fill="{ORANGE_LIGHT}" stroke="{ORANGE}" stroke-width="2"/>')
    c.center_text(1152, 404, ["Policy", "Guard"], size=22, weight=900, fill=TEXT, line_gap=28)

    c.line(1072, 410, 916, 410)
    c.card(736, 355, 180, 110, "Alert Worker", ["알람 요청", "운영자에게 전달"], fill=RED_LIGHT, stroke=RED)
    c.line(1072, 448, 916, 518)
    c.card(736, 480, 180, 110, "Safe PR Agent\nWorker", ["수정 patch", "PR 설명 생성"], fill=PURPLE_LIGHT, stroke=PURPLE)
    c.line(736, 535, 620, 535)
    c.card(440, 480, 180, 110, "SCM / PR Worker", ["PR 생성", "상태 추적"], fill=PURPLE_LIGHT, stroke=PURPLE)
    c.line(1152, 478, 1152, 560)
    c.card(980, 552, 250, 108, "Approval / Command\nWorker", ["사람 승인 후 실행", "auto apply는 정책으로 차단"], fill=ORANGE_LIGHT, stroke=ORANGE)
    c.line(980, 604, 916, 604)
    c.card(736, 590, 180, 100, "Target Cluster\nAgent", ["apply / rollout", "결과 보고"], fill=GREEN_LIGHT, stroke=GREEN)

    c.rect(64, 340, 330, 150, fill="#f8fbff", stroke=LINE, sw=2, rx=10)
    c.text(88, 380, "발표 포인트", size=23, weight=900, fill=TEXT)
    c.text(
        88,
        414,
        ["단순 모니터링이 아니라", "장애 감지 -> 원인 분석", "-> PR/명령까지 이어지는", "운영 자동화 폐루프다."],
        size=17,
        weight=750,
        fill=MUTED,
        line_gap=24,
    )
    return c


def main() -> None:
    slides = {
        "01-desired-state": slide_desired_state(),
        "02-reconciler-location": slide_reconciler(),
        "03-git-helm-cache": slide_git_cache(),
        "04-incident-to-pr-loop": slide_closed_loop(),
    }
    for name, canvas in slides.items():
        save(name, canvas)


if __name__ == "__main__":
    main()
