from __future__ import annotations

from math import atan2, cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "gateway-auth-implementation-flow.png"
WIDTH = 1800
HEIGHT = 1120

FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size)


TITLE = font(42, bold=True)
SUBTITLE = font(20)
LANE_TITLE = font(22, bold=True)
PHASE = font(15, bold=True)
BOX_TITLE = font(21, bold=True)
TEXT = font(17)
SMALL = font(15)
TINY = font(13, bold=True)
CALLOUT_TITLE = font(18, bold=True)
CALLOUT = font(15, bold=True)
NUMBER = font(18, bold=True)

COLORS = {
    "ink": "#172033",
    "muted": "#526071",
    "text": "#3d4b5c",
    "small": "#596778",
    "line": "#56657a",
    "soft": "#8a96a8",
    "blue": "#4169e1",
    "orange": "#b15a00",
    "green": "#21865f",
    "red": "#d6625d",
    "lane_fill": "#ffffff",
    "lane_stroke": "#d8dee8",
    "card": "#ffffff",
    "card_stroke": "#cfd7e5",
    "db": "#eef6ff",
    "db_stroke": "#8ab8f5",
    "redis": "#fff1f0",
    "redis_stroke": "#f29b94",
    "vault": "#f4efff",
    "vault_stroke": "#b9a7f4",
    "event": "#eefaf4",
    "event_stroke": "#83cfa5",
    "policy": "#fff8df",
    "policy_stroke": "#e7c861",
}


def draw_rounded(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    fill: str,
    outline: str,
    width: int = 2,
    radius: int = 8,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_text(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    value: str,
    face: ImageFont.FreeTypeFont,
    fill: str = COLORS["ink"],
) -> None:
    draw.text((x, y), value, font=face, fill=fill)


def draw_pill(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    fill: str,
) -> None:
    draw.rounded_rectangle(xy, radius=8, fill=fill)


def draw_lane(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
) -> None:
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle((x1 + 6, y1 + 8, x2 + 6, y2 + 8), radius=8, fill="#e8ecf3")
    draw_rounded(draw, xy, COLORS["lane_fill"], COLORS["lane_stroke"])


def draw_number(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    value: int,
    fill: str,
) -> None:
    draw.ellipse((cx - 18, cy - 18, cx + 18, cy + 18), fill=fill)
    label = str(value)
    bbox = draw.textbbox((0, 0), label, font=NUMBER)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    draw.text((cx - width / 2, cy - height / 2 - 2), label, font=NUMBER, fill="#ffffff")


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    *,
    color: str = COLORS["line"],
    width: int = 3,
    dashed: bool = False,
) -> None:
    if dashed:
        for (x1, y1), (x2, y2) in zip(points, points[1:], strict=False):
            dx = x2 - x1
            dy = y2 - y1
            length = (dx * dx + dy * dy) ** 0.5
            if length == 0:
                continue
            ux = dx / length
            uy = dy / length
            pos = 0
            while pos < length:
                end = min(pos + 10, length)
                draw.line(
                    (
                        x1 + ux * pos,
                        y1 + uy * pos,
                        x1 + ux * end,
                        y1 + uy * end,
                    ),
                    fill=color,
                    width=width,
                )
                pos += 20
    else:
        draw.line(points, fill=color, width=width, joint="curve")

    x1, y1 = points[-2]
    x2, y2 = points[-1]
    angle = atan2(y2 - y1, x2 - x1)
    head = 16
    spread = pi / 7
    arrow_head = [
        (x2, y2),
        (x2 - head * cos(angle - spread), y2 - head * sin(angle - spread)),
        (x2 - head * cos(angle + spread), y2 - head * sin(angle + spread)),
    ]
    draw.polygon(arrow_head, fill=color)


def draw_card(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    *,
    kind: str = "card",
) -> None:
    if kind == "db":
        fill, outline = COLORS["db"], COLORS["db_stroke"]
    elif kind == "redis":
        fill, outline = COLORS["redis"], COLORS["redis_stroke"]
    elif kind == "vault":
        fill, outline = COLORS["vault"], COLORS["vault_stroke"]
    elif kind == "event":
        fill, outline = COLORS["event"], COLORS["event_stroke"]
    elif kind == "policy":
        fill, outline = COLORS["policy"], COLORS["policy_stroke"]
    else:
        fill, outline = COLORS["card"], COLORS["card_stroke"]
    draw_rounded(draw, (x, y, x + w, y + h), fill, outline)


def render() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#f7f8fb")
    draw = ImageDraw.Draw(image)

    draw_text(draw, 80, 62, "Gateway / Auth 구현 흐름", TITLE)
    draw_text(
        draw,
        80,
        108,
        "우리 서비스 로그인과 외부 도구 credential을 분리하고, secret 없는 event로 worker까지 전달한다.",
        SUBTITLE,
        COLORS["muted"],
    )

    for xy in [(80, 152, 580, 932), (650, 152, 1150, 932), (1220, 152, 1720, 932)]:
        draw_lane(draw, xy)

    draw_pill(draw, (110, 182, 205, 213), COLORS["blue"])
    draw_text(draw, 126, 188, "PHASE 1-2", PHASE, "#ffffff")
    draw_text(draw, 220, 181, "내부 로그인 / 세션 / 프로젝트 권한", LANE_TITLE)

    draw_pill(draw, (680, 182, 775, 213), COLORS["orange"])
    draw_text(draw, 696, 188, "PHASE 3-4", PHASE, "#ffffff")
    draw_text(draw, 790, 181, "Integration 등록 / Action 정책", LANE_TITLE)

    draw_pill(draw, (1250, 182, 1345, 213), COLORS["green"])
    draw_text(draw, 1266, 188, "PHASE 5+", PHASE, "#ffffff")
    draw_text(draw, 1360, 181, "Event / Worker / Token Broker", LANE_TITLE)

    # 1-2단계
    draw_card(draw, 130, 255, 390, 95)
    draw_number(draw, 160, 285, 1, COLORS["blue"])
    draw_text(draw, 190, 276, "Browser / CLI", BOX_TITLE)
    draw_text(draw, 190, 310, "POST /auth/login", TEXT, COLORS["text"])
    draw_text(draw, 190, 337, "email + password 입력", SMALL, COLORS["small"])

    draw_card(draw, 130, 405, 390, 110, kind="db")
    draw_number(draw, 160, 435, 2, COLORS["blue"])
    draw_text(draw, 190, 426, "users 테이블", BOX_TITLE)
    draw_text(draw, 190, 461, "password_hash만 저장", TEXT, COLORS["text"])
    draw_text(draw, 190, 488, "평문 password 저장 금지", SMALL, COLORS["small"])

    draw_card(draw, 130, 570, 390, 110, kind="redis")
    draw_number(draw, 160, 600, 3, COLORS["blue"])
    draw_text(draw, 190, 591, "Redis server-side session", BOX_TITLE)
    draw_text(draw, 190, 626, "opaque session token + TTL", TEXT, COLORS["text"])
    draw_text(draw, 190, 653, "Cookie 또는 Bearer token으로 전달", SMALL, COLORS["small"])

    draw_card(draw, 130, 735, 390, 145, kind="db")
    draw_number(draw, 160, 765, 4, COLORS["blue"])
    draw_text(draw, 190, 756, "project 권한 확인", BOX_TITLE)
    draw_text(draw, 190, 790, "organizations / projects", TEXT, COLORS["text"])
    draw_text(draw, 190, 816, "organization_members / project_members", TEXT, COLORS["text"])
    draw_text(draw, 190, 842, "로그인은 '누구'를 확인하고,", SMALL, COLORS["small"])
    draw_text(draw, 190, 864, "권한은 project 단위로 다시 판단", SMALL, COLORS["small"])

    draw_arrow(draw, [(325, 350), (325, 395)])
    draw_arrow(draw, [(325, 515), (325, 560)])
    draw_arrow(draw, [(325, 680), (325, 725)])

    # 3-4단계
    draw_card(draw, 700, 255, 390, 120)
    draw_number(draw, 730, 285, 5, COLORS["orange"])
    draw_text(draw, 775, 276, "보호 API 진입", BOX_TITLE)
    draw_text(draw, 760, 310, "/commands, /dashboard/query", TEXT, COLORS["text"])
    draw_text(draw, 760, 338, "1. request schema 검증", SMALL, COLORS["small"])
    draw_text(draw, 760, 363, "2. require_session → project role 검사", SMALL, COLORS["small"])

    draw_card(draw, 700, 430, 390, 135, kind="db")
    draw_number(draw, 730, 460, 6, COLORS["orange"])
    draw_text(draw, 760, 451, "Integration 등록", BOX_TITLE)
    draw_text(draw, 760, 486, "integration_targets", TEXT, COLORS["text"])
    draw_text(draw, 760, 512, "credentials(secret_ref만)", TEXT, COLORS["text"])
    draw_text(draw, 760, 538, "credential_bindings(allowed_actions)", TEXT, COLORS["text"])

    draw_card(draw, 700, 620, 390, 135, kind="policy")
    draw_number(draw, 730, 650, 7, COLORS["orange"])
    draw_text(draw, 760, 641, "AccessPolicy.evaluate", BOX_TITLE)
    draw_text(draw, 760, 676, "role 권한 + target 소속 + binding action", TEXT, COLORS["text"])
    draw_text(draw, 760, 704, "viewer는 create_pr 거부", SMALL, COLORS["small"])
    draw_text(draw, 760, 729, "maintainer는 binding 있으면 허용", SMALL, COLORS["small"])

    draw_rounded(draw, (700, 810, 1090, 880), "#fff4e8", "#e6b47b")
    draw_text(draw, 730, 828, "주의", CALLOUT_TITLE, "#6f3d00")
    draw_text(draw, 790, 819, "GitHub token, PAT, private key는", CALLOUT, "#744705")
    draw_text(draw, 790, 843, "response/event/log에 절대 넣지 않음", CALLOUT, "#744705")
    draw_text(draw, 790, 867, "DB에는 raw secret 대신 secret_ref만 저장", CALLOUT, "#744705")

    draw_arrow(draw, [(895, 375), (895, 420)])
    draw_arrow(draw, [(895, 565), (895, 610)])
    draw_arrow(draw, [(895, 755), (895, 800)], color=COLORS["soft"], dashed=True)

    # 5단계+
    draw_card(draw, 1270, 255, 390, 120, kind="event")
    draw_number(draw, 1300, 285, 8, COLORS["green"])
    draw_text(draw, 1330, 276, "secret 없는 event 발행", BOX_TITLE)
    draw_text(draw, 1330, 310, "project_id / target_id", TEXT, COLORS["text"])
    draw_text(draw, 1330, 336, "requested_by / action", TEXT, COLORS["text"])
    draw_text(draw, 1330, 364, "worker는 secret을 event에서 받지 않음", SMALL, COLORS["small"])

    draw_card(draw, 1270, 430, 390, 110)
    draw_number(draw, 1300, 460, 9, COLORS["green"])
    draw_text(draw, 1330, 451, "Worker / Service", BOX_TITLE)
    draw_text(draw, 1330, 486, "target_id + action만 알고 처리", TEXT, COLORS["text"])
    draw_text(draw, 1330, 513, "credential_id 또는 raw vault read 금지", SMALL, COLORS["small"])

    draw_card(draw, 1270, 595, 390, 140, kind="policy")
    draw_number(draw, 1300, 625, 10, COLORS["green"])
    draw_text(draw, 1330, 616, "TokenBroker.issue", BOX_TITLE)
    draw_text(draw, 1330, 651, "AccessPolicy를 먼저 다시 검사", TEXT, COLORS["text"])
    draw_text(draw, 1330, 679, "실패하면 vault read 호출 안 함", SMALL, COLORS["small"])
    draw_text(draw, 1330, 704, "성공하면 binding의 secret_ref 사용", SMALL, COLORS["small"])

    draw_card(draw, 1270, 775, 180, 100, kind="vault")
    draw_text(draw, 1300, 805, "SecretVault", BOX_TITLE)
    draw_text(draw, 1300, 839, "secret_ref로 조회", SMALL, COLORS["small"])

    draw_card(draw, 1480, 775, 180, 100)
    draw_text(draw, 1508, 805, "Adapter", BOX_TITLE)
    draw_text(draw, 1508, 839, "GitHub / Prometheus", SMALL, COLORS["small"])

    draw_arrow(draw, [(1465, 375), (1465, 420)])
    draw_arrow(draw, [(1465, 540), (1465, 585)])
    draw_arrow(draw, [(1465, 735), (1370, 765)])
    draw_arrow(draw, [(1450, 825), (1470, 825)])

    draw_arrow(draw, [(520, 315), (690, 315)])
    draw_text(draw, 555, 286, "session token으로 보호 API 호출", TINY, "#667485")

    draw_arrow(draw, [(1090, 690), (1168, 690), (1195, 315), (1260, 315)])
    draw_text(draw, 1120, 638, "허용된 action만 event 발행", TINY, "#667485")

    draw_arrow(
        draw,
        [(1090, 495), (1170, 495), (1195, 660), (1260, 660)],
        color=COLORS["soft"],
        dashed=True,
    )
    draw_text(draw, 1116, 533, "binding 정보는 Broker/Policy가 참조", TINY, "#667485")

    draw_arrow(draw, [(1065, 890), (1145, 940), (1315, 950), (1358, 885)], color=COLORS["red"])
    draw_text(
        draw, 1120, 950, "secret은 event/worker payload로 직접 이동하지 않음", CALLOUT, "#744705"
    )

    draw_rounded(draw, (80, 970, 1720, 1080), "#ffffff", COLORS["lane_stroke"])
    draw_text(draw, 115, 994, "구현 순서 요약", CALLOUT_TITLE, "#175b47")
    draw_text(
        draw,
        115,
        1029,
        "1 users + login → 2 Redis session → 3 project membership → 4 GitHub target/credential/binding",
        CALLOUT,
        "#25624f",
    )
    draw_text(
        draw,
        115,
        1051,
        "→ 5 AccessPolicy → 6 TokenBroker → 7 Prometheus로 추상화 검증",
        CALLOUT,
        "#25624f",
    )
    draw_rounded(draw, (1205, 985, 1675, 1035), "#f7fbff", "#c6d8ef")
    draw_text(draw, 1230, 1002, "완료 기준: 로그인 성공, logout 후 401,", SMALL, COLORS["small"])
    draw_text(draw, 1230, 1024, "viewer create_pr 거부, secret 미노출", SMALL, COLORS["small"])

    image.save(OUT)
    print(OUT)


if __name__ == "__main__":
    render()
