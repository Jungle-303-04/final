// ── 홈 위젯 보드 부품 (D21 · Surface Spec §2) — 데모 구현.
// WidgetFrame 하나 + 시각 부품(KpiCard/RatioBar/MiniBars/Donut/RankList)만 존재한다.
// 위젯별 자체 시각 신설 금지 — 제품 이식 시 shared/ui/charts/로 재구현되는 사양 원본.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Info, ChevronRight, ChevronDown } from "lucide-react";
import { UI, BLUE, HP, MONO, SOFT } from "./theme";

// ── WidgetFrame — 유일한 위젯 껍데기: 제목 + ⓘ 툴팁 + `>` 딥링크(실 목적지만) + 접기 ──
export function WidgetFrame({ title, info, onDeepLink, deepLabel, collapsed, onToggle, editing, onRemove, onMove, children }: {
  title: string; info?: string; onDeepLink?: () => void; deepLabel?: string;
  collapsed?: boolean; onToggle?: () => void; editing?: boolean; onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const [tip, setTip] = useState(false);
  return (
    <div style={{ background: UI.card, border: `1px solid ${editing ? "rgba(10,132,255,0.4)" : UI.line}`, borderRadius: 14, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 11, minWidth: 0, position: "relative", transition: "border-color .2s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {editing && onMove && (
          <span style={{ display: "flex", gap: 2, marginRight: 2 }}>
            {([[-1, "◀"], [1, "▶"]] as const).map(([d, g]) => (
              <button key={d} onClick={() => onMove(d)} title={d === -1 ? "앞으로" : "뒤로"}
                style={{ width: 20, height: 20, borderRadius: 6, border: "none", background: "rgba(10,132,255,0.09)", color: BLUE, cursor: "pointer", fontSize: 9, lineHeight: 1 }}>{g}</button>
            ))}
          </span>
        )}
        <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", color: UI.ink }}>{title}</span>
        {info && (
          <span style={{ position: "relative", display: "grid" }} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
            <Info size={12.5} style={{ color: UI.ink3, cursor: "help" }} />
            {tip && (
              <span style={{ position: "absolute", top: 20, left: -8, zIndex: 30, width: 210, background: "rgba(17,19,24,0.92)", color: "#fff", fontSize: 11, lineHeight: 1.5, borderRadius: 8, padding: "7px 10px", backdropFilter: "blur(8px)" }}>{info}</span>
            )}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {editing && onRemove && (
            <button onClick={onRemove} title="위젯 숨기기"
              style={{ width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(255,95,85,0.12)", color: HP.crit, cursor: "pointer", fontSize: 13, lineHeight: 1, fontWeight: 700 }}>×</button>
          )}
          {onToggle && (
            <button onClick={onToggle} title={collapsed ? "펼치기" : "접기"} className="gnav"
              style={{ width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(17,19,24,0.05)", color: UI.ink3, cursor: "pointer", display: "grid", placeItems: "center" }}>
              <ChevronDown size={13} style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform .18s" }} />
            </button>
          )}
          {onDeepLink && (
            <button onClick={onDeepLink} className="gnav" title={deepLabel}
              style={{ display: "flex", alignItems: "center", gap: 2, border: "none", background: "transparent", color: BLUE, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: "2px 4px", borderRadius: 6 }}>
              {deepLabel}<ChevronRight size={12} />
            </button>
          )}
        </span>
      </div>
      {!collapsed && children}
    </div>
  );
}

// ── KpiCard — 큰 값 + 증감 틴트 + 요약 1줄 (P-12·P-17) ──
export function KpiValue({ value, unit, delta, deltaTone, summary }: {
  value: string; unit?: string; delta?: string; deltaTone?: "ok" | "warn"; summary?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: MONO, color: UI.ink, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 12.5, fontWeight: 600, color: UI.ink3 }}>{unit}</span>}
        {delta && (
          <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: MONO, color: deltaTone === "warn" ? "#B25A00" : "#1F9D4D", background: deltaTone === "warn" ? "rgba(255,179,64,0.14)" : "rgba(48,209,88,0.12)", borderRadius: 999, padding: "2px 8px" }}>{delta}</span>
        )}
      </span>
      {summary && <span style={{ fontSize: 12, color: UI.ink2, lineHeight: 1.5 }}>{summary}</span>}
    </div>
  );
}

// ── RatioBar — 이중 비율 바 + 범례 (P-19) ──
export function RatioBar({ a, b, aLabel, bLabel, aColor = HP.ok, bColor = HP.warn }: {
  a: number; b: number; aLabel: string; bLabel: string; aColor?: string; bColor?: string;
}) {
  const total = a + b || 1;
  const ap = Math.round((a / total) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", gap: 3, height: 8, borderRadius: 999, overflow: "hidden" }}>
        <motion.span initial={false} animate={{ width: `${ap}%` }} transition={{ duration: 0.9, ease: "easeInOut" }} style={{ background: aColor, borderRadius: 999 }} />
        <span style={{ flex: 1, background: bColor, borderRadius: 999, opacity: b === 0 ? 0.18 : 1 }} />
      </div>
      {([[aColor, aLabel, a, ap], [bColor, bLabel, b, 100 - ap]] as const).map(([c, l, v, p]) => (
        <span key={l} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: UI.ink2 }}>
          <span style={{ width: 4, height: 13, borderRadius: 2, background: c }} />
          <b style={{ fontFamily: MONO, color: UI.ink, fontVariantNumeric: "tabular-nums" }}>{v}</b>{l}
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11.5, color: UI.ink3 }}>{p}%</span>
        </span>
      ))}
    </div>
  );
}

// ── MiniBars — 미니 막대 + 현재 구간 강조 (P-20) ──
export function MiniBars({ values, labels, currentIndex, tone = BLUE }: {
  values: number[]; labels?: string[]; currentIndex?: number; tone?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 64 }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <motion.span initial={{ height: 0 }} animate={{ height: `${Math.max((v / max) * 100, 4)}%` }} transition={{ ...SOFT, delay: i * 0.04 }}
            style={{ width: "100%", maxWidth: 22, borderRadius: 5, background: i === currentIndex ? tone : "rgba(17,19,24,0.09)", minHeight: 3 }} />
          {labels && <span style={{ fontSize: 9.5, fontFamily: MONO, color: i === currentIndex ? UI.ink : UI.ink3, fontWeight: i === currentIndex ? 700 : 500 }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Donut — 도넛 + 값 범례 (P-14) ──
const DONUT_COLORS = [BLUE, HP.ok, HP.warn, "#8250DF", "#0FA3B1", "#9AA0AA"];
export function Donut({ items, onPick }: { items: { label: string; value: number }[]; onPick?: (label: string) => void }) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const R = 34, C = 2 * Math.PI * R;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={88} height={88} viewBox="0 0 88 88" style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
        {items.map((it, i) => {
          const frac = it.value / total;
          const dash = `${Math.max(frac * C - 2.5, 0)} ${C}`;
          const off = -acc * C; acc += frac;
          return <motion.circle key={it.label} cx={44} cy={44} r={R} fill="none" strokeWidth={11} strokeLinecap="round"
            stroke={DONUT_COLORS[i % DONUT_COLORS.length]} initial={{ strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: dash }} transition={{ duration: 0.8, ease: "easeInOut", delay: i * 0.08 }} strokeDashoffset={off} />;
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
        {items.map((it, i) => (
          <button key={it.label} onClick={onPick ? () => onPick(it.label) : undefined} disabled={!onPick} className={onPick ? "rrow" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: UI.ink2, border: "none", background: "transparent", padding: "1px 4px", borderRadius: 6, cursor: onPick ? "pointer" : "default", textAlign: "left", minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            <b style={{ marginLeft: "auto", fontFamily: MONO, color: UI.ink, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{it.value}</b>
            <span style={{ fontFamily: MONO, fontSize: 11, color: UI.ink3, width: 34, textAlign: "right", flexShrink: 0 }}>{Math.round((it.value / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── RankList — 색점 순위 리스트 (P-30) · 임계 행 틴트(P-01) ──
export function RankList({ rows, onPick }: {
  rows: { id: string; tone: "ok" | "warn" | "crit"; title: string; sub?: string; right?: string }[];
  onPick?: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r, i) => (
        <motion.button key={r.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.05 }}
          onClick={onPick ? () => onPick(r.id) : undefined} disabled={!onPick} className={onPick ? "rrow" : undefined}
          style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", border: "none", borderRadius: 9, padding: "7px 10px", cursor: onPick ? "pointer" : "default",
            background: r.tone === "crit" ? "rgba(255,95,85,0.07)" : "transparent" }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: HP[r.tone], flexShrink: 0 }} className={r.tone === "crit" ? "pulsedot" : undefined} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: UI.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
            {r.sub && <span style={{ display: "block", fontSize: 11, fontFamily: MONO, color: UI.ink3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span>}
          </span>
          {r.right && <span style={{ fontSize: 11, fontFamily: MONO, color: UI.ink3, flexShrink: 0 }}>{r.right}</span>}
        </motion.button>
      ))}
    </div>
  );
}

// ── MultiLine — 활동 추이 멀티라인 (P-36, EASE_DRAW 드로잉 + 범례) ──
export function MultiLine({ series, height = 92 }: {
  series: { label: string; color: string; values: number[] }[]; height?: number;
}) {
  const W = 100, H = 40;
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const path = (vs: number[]) => vs.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (vs.length - 1)) * W},${H - (v / max) * (H - 4) - 2}`).join(" ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke={UI.line2} strokeWidth={0.4} strokeDasharray="1.5 2.5" />)}
        {series.map((s) => (
          <motion.path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div style={{ display: "flex", gap: 13, flexWrap: "wrap" }}>
        {series.map((s) => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: UI.ink2 }}>
            <span style={{ width: 8, height: 2.5, borderRadius: 2, background: s.color }} />{s.label}
            <b style={{ fontFamily: MONO, color: UI.ink, fontVariantNumeric: "tabular-nums" }}>{s.values[s.values.length - 1]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── MiniTimeline — 최근 변경 세로 리스트 (P-21 문법: 시간·노드·점선 연결) ──
export function MiniTimeline({ items, onPick }: {
  items: { id: string; time: string; tone: "ok" | "warn" | "crit"; title: string; ref?: { kind: string; name: string } }[];
  onPick?: (ref: { kind: string; name: string }) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((it, i) => (
        <motion.div key={it.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: i * 0.05 }}
          style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 40, flexShrink: 0, fontSize: 10.5, fontFamily: MONO, color: UI.ink3, paddingTop: 2, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.time}</span>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch", flexShrink: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, border: `2px solid ${HP[it.tone]}`, background: it.tone === "crit" ? HP.crit : "transparent", marginTop: 3 }} />
            {i < items.length - 1 && <span style={{ flex: 1, width: 1, borderLeft: `1.5px dashed ${UI.line}`, minHeight: 14 }} />}
          </span>
          <button onClick={it.ref && onPick ? () => onPick(it.ref!) : undefined} disabled={!it.ref || !onPick} className={it.ref && onPick ? "rrow" : undefined}
            style={{ border: "none", background: "transparent", textAlign: "left", fontSize: 12.5, color: UI.ink, fontWeight: 600, padding: "0 4px 12px", borderRadius: 6, cursor: it.ref && onPick ? "pointer" : "default", minWidth: 0 }}>
            {it.title}{it.ref && onPick && <ChevronRight size={11} style={{ color: UI.ink3, verticalAlign: -1, marginLeft: 2 }} />}
          </button>
        </motion.div>
      ))}
    </div>
  );
}
